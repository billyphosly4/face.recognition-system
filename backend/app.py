"""
Tourism Guide Matching System — Flask Backend API
===================================================
Endpoints:
  GET  /api/status                  → System health & engine status
  POST /api/guides/register         → Register a guide with face embedding
  GET  /api/tourists/browse-guides  → List all approved guides
  POST /api/tourists/verify-guide   → Verify a guide's identity via live photo
"""

import os
import sys
import subprocess
import uuid
import base64
import hashlib
import json
import traceback
import numpy as np
import cv2
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ── Configuration ────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "temp")
os.makedirs(TEMP_DIR, exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────
# 1. Firebase / Google Cloud Firestore Setup
# ─────────────────────────────────────────────────────────────────────────
USING_MOCK_FIRESTORE = True
FIRESTORE_ERROR = ""
db = None


class MockCollection:
    """File-based Firestore collection emulator for local development."""

    def __init__(self, filepath):
        self.filepath = filepath

    def _load(self):
        if not os.path.exists(self.filepath):
            return {}
        try:
            with open(self.filepath, "r") as f:
                return json.load(f)
        except Exception:
            return {}

    def _save(self, data):
        try:
            with open(self.filepath, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"[ERROR] Mock Firestore save failed: {e}")

    def add(self, doc_data):
        db_data = self._load()
        doc_id = f"guide_{uuid.uuid4().hex[:12]}"
        db_data[doc_id] = doc_data
        self._save(db_data)

        class MockDocRef:
            def __init__(self, id):
                self.id = id

        return None, MockDocRef(doc_id)

    def document(self, doc_id):
        return MockDocument(self, doc_id)

    def stream(self):
        db_data = self._load()

        class MockSnapshot:
            def __init__(self, id, data):
                self.id = id
                self._data = data

            def to_dict(self):
                return self._data

        for doc_id, data in db_data.items():
            yield MockSnapshot(doc_id, data)


class MockDocument:
    """Simulates a Firestore DocumentReference for .get() and .set() access."""

    def __init__(self, collection, doc_id):
        self.collection = collection
        self.doc_id = doc_id

    def get(self):
        db_data = self.collection._load()
        data = db_data.get(self.doc_id)

        class MockSnapshot:
            def __init__(self, id, data, exists):
                self.id = id
                self._data = data
                self.exists = exists

            def to_dict(self):
                return self._data

        return MockSnapshot(self.doc_id, data, data is not None)

    def set(self, data):
        db_data = self.collection._load()
        db_data[self.doc_id] = data
        self.collection._save(db_data)

    def update(self, data):
        db_data = self.collection._load()
        if self.doc_id in db_data:
            db_data[self.doc_id].update(data)
            self.collection._save(db_data)


class MockFirestoreClient:
    """Top-level mock client that dispatches collection names to JSON files."""

    def __init__(self, base_dir):
        self.base_dir = base_dir

    def collection(self, name):
        filepath = os.path.join(self.base_dir, f"mock_{name}.json")
        return MockCollection(filepath)


# Attempt to connect to real Google Cloud Firestore
CREDENTIALS_PATH = os.path.join(BASE_DIR, "firebase-credentials.json")
if os.path.exists(CREDENTIALS_PATH):
    print("[INFO] firebase-credentials.json found. Connecting to Google Cloud Firestore...")
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            cred = credentials.Certificate(CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred)

        db = firestore.client()
        USING_MOCK_FIRESTORE = False
        print("[INFO] ✓ Connected to Google Cloud Firestore successfully.")
    except Exception as e:
        FIRESTORE_ERROR = str(e)
        print(f"[WARNING] Firestore initialization failed: {e}")
        print("[INFO] Falling back to Mock Firestore emulator...")
else:
    print("[INFO] No firebase-credentials.json found in backend/.")
    print("[INFO] Using file-based Mock Firestore for local development.")

if USING_MOCK_FIRESTORE:
    db = MockFirestoreClient(BASE_DIR)
    print(f"[INFO] Mock Firestore ready → {os.path.join(BASE_DIR, 'mock_guides.json')}")


# ─────────────────────────────────────────────────────────────────────────
# 2. DeepFace Biometric Engine Check
# ─────────────────────────────────────────────────────────────────────────
DEEPFACE_AVAILABLE = False
DEEPFACE_ERROR = ""


def check_biometric_engine():
    """Subprocess pre-flight test for TensorFlow/DeepFace CPU compatibility."""
    print("[INFO] Running DeepFace/TensorFlow pre-flight compatibility check...")
    try:
        result = subprocess.run(
            [sys.executable, "-c", "from deepface import DeepFace; print('ENGINE_OK')"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
        )
        stdout = result.stdout.decode("utf-8", errors="ignore").strip()
        stderr = result.stderr.decode("utf-8", errors="ignore").strip()

        if result.returncode == 0 and "ENGINE_OK" in stdout:
            print("[INFO] ✓ DeepFace engine is available and compatible.")
            return True, ""

        reason = "Import failed."
        if result.returncode < 0 or "illegal instruction" in stderr.lower():
            reason = "CPU lacks AVX/AVX2 instructions required by TensorFlow (SIGILL)."
        elif stderr:
            reason = stderr.split("\n")[-1]

        print(f"[WARNING] ✗ DeepFace check failed: {reason}")
        print("[WARNING] Face embeddings will be simulated with random vectors.")
        return False, reason
    except Exception as e:
        print(f"[WARNING] Pre-flight check error: {e}")
        return False, str(e)


DEEPFACE_AVAILABLE, DEEPFACE_ERROR = check_biometric_engine()


# ─────────────────────────────────────────────────────────────────────────
# 3. Core Helper Functions
# ─────────────────────────────────────────────────────────────────────────
def cosine_distance(v1, v2):
    """Cosine distance between two vectors (0 = identical, 2 = opposite)."""
    a, b = np.array(v1), np.array(v2)
    dot = np.dot(a, b)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 1.0
    return 1.0 - (dot / (na * nb))


def get_simulated_image_embedding(img_path, expected_dim=512):
    """Create a deterministic embedding from the face image when DeepFace is unavailable."""
    try:
        with Image.open(img_path) as img:
            img = img.convert("RGB")
            img_arr = np.array(img)
            gray = cv2.cvtColor(img_arr, cv2.COLOR_RGB2GRAY)
            face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
            faces = face_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=4, minSize=(64, 64)
            )
            if len(faces) > 0:
                x, y, w, h = max(faces, key=lambda rect: rect[2] * rect[3])
                face = gray[y : y + h, x : x + w]
            else:
                face = gray

            face = cv2.resize(face, (64, 64), interpolation=cv2.INTER_AREA)
            vector = face.astype(np.float32).flatten() / 255.0
            vector = vector - np.mean(vector)
            norm = np.linalg.norm(vector)
            if norm != 0:
                vector = vector / norm
            if len(vector) > expected_dim:
                return vector[:expected_dim].tolist()
            padded = np.zeros(expected_dim, dtype=np.float32)
            padded[: len(vector)] = vector
            return padded.tolist()
    except Exception as e:
        print(f"[SIMULATOR] Image fallback failed: {e}")
        with open(img_path, "rb") as f:
            data_hash = hashlib.sha256(f.read()).hexdigest()
        seed = int(data_hash[:15], 16) % 2**32
        rng = np.random.default_rng(seed)
        return rng.uniform(-0.1, 0.1, expected_dim).tolist()


# ---- ONNX FaceNet support (optional) ----
ONNX_MODEL_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "models", "facenet512.onnx"))
_onnx_session = None

def load_onnx_model(path=ONNX_MODEL_PATH):
    global _onnx_session
    if _onnx_session is not None:
        return _onnx_session
    if not os.path.exists(path):
        return None
    try:
        import onnxruntime as ort

        _onnx_session = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        print(f"[ONNX] Loaded model: {path}")
        return _onnx_session
    except Exception as e:
        print(f"[ONNX] Failed to load model {path}: {e}")
        return None


def embedding_from_onnx(img_path, onnx_path=ONNX_MODEL_PATH, expected_dim=512):
    sess = load_onnx_model(onnx_path)
    if not sess:
        raise Exception("ONNX model not available")
    # infer required input spatial size from model
    input_meta = sess.get_inputs()[0]
    shape = input_meta.shape
    try:
        _, c, h, w = [int(x) if (isinstance(x, (int,)) or (isinstance(x, str) and x.isdigit())) else None for x in shape]
    except Exception:
        c, h, w = 3, 64, 64
    h = h or 64
    w = w or 64

    with Image.open(img_path).convert("RGB") as img:
        img = img.resize((w, h), Image.LANCZOS)
        arr = np.array(img).astype(np.float32)
        arr = (arr - 127.5) / 128.0
        arr = np.transpose(arr, (2, 0, 1))[None, ...].astype(np.float32)

    input_name = input_meta.name
    out = sess.run(None, {input_name: arr})[0]
    vec = np.array(out).reshape(-1)
    vec = vec - np.mean(vec)
    n = np.linalg.norm(vec)
    if n > 0:
        vec = vec / n
    if len(vec) > expected_dim:
        return vec[:expected_dim].tolist()
    padded = np.zeros(expected_dim, dtype=np.float32)
    padded[: len(vec)] = vec
    return padded.tolist()


def get_face_embedding(img_path, model_name="FaceNet"):
    """Extract a face embedding vector from an image file.

    model_name: 'FaceNet' -> 512-dim, 'VGG-Face' -> 4096-dim (legacy),
    or any DeepFace-supported model name. When DeepFace is not available,
    return a deterministic simulated vector matching the expected dimension.
    """
    # Choose expected dimension by model
    expected_dim = 512 if model_name.lower() in ("facenet", "facenet") else 4096 if model_name.lower() in ("vgg-face", "vggface", "vgg_face") else 512

    if not DEEPFACE_AVAILABLE:
        # Prefer ONNX FaceNet if present, otherwise use the simulator
        try:
            sess = load_onnx_model()
            if sess is not None and expected_dim == 512:
                return embedding_from_onnx(img_path, expected_dim=expected_dim)
        except Exception as e:
            print(f"[ONNX] Inference skipped: {e}")

        print(f"[SIMULATOR] Generating deterministic image-based {expected_dim}-dim embedding for {model_name}...")
        return get_simulated_image_embedding(img_path, expected_dim)

    from deepface import DeepFace

    representations = DeepFace.represent(
        img_path=img_path,
        model_name=model_name,
        enforce_detection=False,
        detector_backend="opencv",
    )
    if not representations:
        raise Exception("No face could be detected or aligned in the image.")
    return representations[0]["embedding"]


def decode_base64_image(base64_str):
    """Decode a base64 image string and save it as a temp file. Returns file path."""
    if "," in base64_str:
        _, base64_str = base64_str.split(",", 1)
    img_data = base64.b64decode(base64_str)
    filepath = os.path.join(TEMP_DIR, f"cap_{uuid.uuid4().hex}.jpg")
    with open(filepath, "wb") as f:
        f.write(img_data)
    return filepath


def cleanup_temp(filepath):
    """Safely remove a temporary file."""
    if filepath and os.path.exists(filepath):
        try:
            os.remove(filepath)
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────
# 4. API Routes
# ─────────────────────────────────────────────────────────────────────────
@app.route("/api/status", methods=["GET"])
def get_status():
    """System health check — returns engine status, Firestore mode, guide count."""
    guides_count = 0
    try:
        guides_count = sum(1 for _ in db.collection("guides").stream())
    except Exception:
        pass

    return jsonify(
        {
            "status": "online",
            "deepface_available": DEEPFACE_AVAILABLE,
            "deepface_error": DEEPFACE_ERROR if not DEEPFACE_AVAILABLE else None,
            "firestore_mode": (
                "Mock Simulator" if USING_MOCK_FIRESTORE else "Google Cloud Firestore"
            ),
            "firestore_error": (
                FIRESTORE_ERROR if USING_MOCK_FIRESTORE and FIRESTORE_ERROR else None
            ),
            "guides_count": guides_count,
        }
    )


@app.route("/api/guides/register", methods=["POST"])
def register_guide():
    """
    Register a new tour guide.
    Accepts: name, phone, national_id, hourly_rate, bio, languages, photo.
    Extracts face embedding and saves to Firestore `guides` collection.
    """
    tmp = None
    try:
        # ── Parse input (multipart or JSON) ──
        if request.content_type and "multipart" in request.content_type:
            name = request.form.get("name", "").strip()
            phone = request.form.get("phone", "").strip()
            national_id = request.form.get("national_id", "").strip()
            hourly_rate = request.form.get("hourly_rate", "").strip()
            bio = request.form.get("bio", "").strip()
            languages = request.form.get("languages", "").strip()

            if "photo" not in request.files:
                return jsonify({"success": False, "error": "No photo file provided."}), 400
            uploaded = request.files["photo"]
            tmp = os.path.join(TEMP_DIR, f"reg_{uuid.uuid4().hex}_{uploaded.filename}")
            uploaded.save(tmp)
        else:
            data = request.get_json() or {}
            name = data.get("name", "").strip()
            phone = data.get("phone", "").strip()
            national_id = data.get("national_id", "").strip()
            hourly_rate = str(data.get("hourly_rate", "")).strip()
            bio = data.get("bio", "").strip()
            languages = data.get("languages", "").strip()
            photo_b64 = data.get("photo")
            if not photo_b64:
                return jsonify({"success": False, "error": "No photo data provided."}), 400
            tmp = decode_base64_image(photo_b64)

        # ── Validate required fields ──
        if not all([name, phone, national_id, hourly_rate]):
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "All fields are required: name, phone, national_id, hourly_rate.",
                    }
                ),
                400,
            )

        try:
            rate_float = float(hourly_rate)
        except ValueError:
            return jsonify({"success": False, "error": "hourly_rate must be a number."}), 400

        print(f"[INFO] Registering guide: {name} (ID: {national_id})")

        # ── Extract face embedding ──
        embedding = get_face_embedding(tmp)

        # ── Build Firestore document ──
        guide_doc = {
            "name": name,
            "phone": phone,
            "national_id": national_id,
            "hourly_rate": rate_float,
            "bio": bio,
            "languages": languages,
            "face_embedding": embedding,
            "status": "approved",
            "registered_at": str(np.datetime64("now")),
        }

        if not USING_MOCK_FIRESTORE:
            from firebase_admin import firestore as fs_module
            guide_doc["registered_at"] = fs_module.SERVER_TIMESTAMP

        _, doc_ref = db.collection("guides").add(guide_doc)
        print(f"[SUCCESS] Guide registered → doc ID: {doc_ref.id}")

        cleanup_temp(tmp)

        return jsonify(
            {
                "success": True,
                "message": "Guide profile registered and approved.",
                "guide": {
                    "id": doc_ref.id,
                    "name": name,
                    "phone": phone,
                    "national_id": national_id,
                    "hourly_rate": rate_float,
                    "bio": bio,
                    "languages": languages,
                    "status": "approved",
                },
            }
        )

    except Exception as e:
        traceback.print_exc()
        cleanup_temp(tmp)
        return jsonify({"success": False, "error": str(e)}), 500
@app.route("/api/tourists/signup", methods=["POST"])
def tourist_signup():
    """
    Register a new tourist.
    Accepts: name, email, password.
    Creates auth user (Firebase Auth) and user profile (Firestore tourists collection).
    """
    try:
        data = request.get_json() or {}
        name = data.get("name", "").strip()
        email = data.get("email", "").strip()
        password = data.get("password", "").strip()

        if not all([name, email, password]):
            return jsonify({"success": False, "error": "Name, email, and password are required."}), 400

        if len(password) < 6:
            return jsonify({"success": False, "error": "Password must be at least 6 characters long."}), 400

        print(f"[INFO] Registering tourist: {name} ({email})")

        user_uid = None
        created_via_firebase = False

        if not USING_MOCK_FIRESTORE:
            try:
                from firebase_admin import auth
                user = auth.create_user(
                    email=email,
                    password=password,
                    display_name=name
                )
                user_uid = user.uid
                created_via_firebase = True
                print(f"[INFO] Firebase Auth user created: {user_uid}")
            except Exception as e:
                print(f"[WARNING] Firebase Auth signup failed: {e}. Checking if we can fallback...")
                return jsonify({"success": False, "error": str(e)}), 400

        if not created_via_firebase:
            user_uid = f"tourist_{uuid.uuid4().hex[:12]}"

        # Save to Firestore (or Mock Firestore) tourists collection
        tourist_doc = {
            "name": name,
            "email": email,
            "role": "tourist",
            "password": password, # Storing password for mock login validation
            "created_at": str(np.datetime64("now"))
        }

        if not USING_MOCK_FIRESTORE:
            from firebase_admin import firestore as fs_module
            tourist_doc["created_at"] = fs_module.SERVER_TIMESTAMP
            # Remove password from firestore for security
            if "password" in tourist_doc:
                del tourist_doc["password"]

        db.collection("tourists").document(user_uid).set(tourist_doc)
        print(f"[SUCCESS] Tourist registered → UID: {user_uid}")

        return jsonify({
            "success": True,
            "message": "Tourist profile registered successfully.",
            "user": {
                "uid": user_uid,
                "name": name,
                "email": email
            }
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/tourists/login", methods=["POST"])
def tourist_login():
    """
    Authenticate a tourist.
    Accepts: email, password.
    Returns: user info and success status.
    """
    try:
        data = request.get_json() or {}
        email = data.get("email", "").strip()
        password = data.get("password", "").strip()

        if not all([email, password]):
            return jsonify({"success": False, "error": "Email and password are required."}), 400

        print(f"[INFO] Logging in tourist: {email}")

        # Check real firebase auth rest api if API key is provided
        api_key = os.environ.get("FIREBASE_WEB_API_KEY", "AIzaSyDIonCdN_UPUkl8LEDVwqBTXF66j1cpwPo")
        if not USING_MOCK_FIRESTORE and api_key:
            import requests
            url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}"
            payload = {"email": email, "password": password, "returnSecureToken": True}
            try:
                r = requests.post(url, json=payload)
                res_data = r.json()
                if r.status_code == 200:
                    local_id = res_data.get("localId")
                    doc_snapshot = db.collection("tourists").document(local_id).get()
                    name = email.split("@")[0] # fallback
                    if doc_snapshot.exists:
                        name = doc_snapshot.to_dict().get("name", name)
                    return jsonify({
                        "success": True,
                        "message": "Login successful.",
                        "user": {
                            "uid": local_id,
                            "name": name,
                            "email": email,
                            "idToken": res_data.get("idToken")
                        }
                    })
                else:
                    error_msg = res_data.get("error", {}).get("message", "Authentication failed.")
                    return jsonify({"success": False, "error": error_msg}), 401
            except Exception as e:
                print(f"[WARNING] Firebase Auth REST API login failed: {e}")

        # Fallback/Mock Auth checking
        tourists_ref = db.collection("tourists")
        found_user = None
        found_uid = None

        for doc in tourists_ref.stream():
            d = doc.to_dict()
            if d.get("email", "").lower() == email.lower():
                if not USING_MOCK_FIRESTORE:
                    try:
                        from firebase_admin import auth
                        user = auth.get_user_by_email(email)
                        found_uid = user.uid
                        found_user = d
                        break
                    except Exception:
                        pass
                else:
                    if d.get("password") == password:
                        found_uid = doc.id
                        found_user = d
                        break

        if found_user:
            return jsonify({
                "success": True,
                "message": "Login successful.",
                "user": {
                    "uid": found_uid,
                    "name": found_user.get("name", "Tourist User"),
                    "email": found_user.get("email", email)
                }
            })

        return jsonify({"success": False, "error": "Invalid email or password."}), 401

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/tourists/browse-guides", methods=["GET"])
def browse_guides():
    """Return all approved guide profiles (without embedding vectors)."""
    try:
        guides = []
        for doc in db.collection("guides").stream():
            d = doc.to_dict() or {}
            if d.get("status") != "approved":
                continue
            guides.append(
                {
                    "id": doc.id,
                    "name": d.get("name", ""),
                    "phone": d.get("phone", ""),
                    "national_id": d.get("national_id", ""),
                    "hourly_rate": d.get("hourly_rate", 0),
                    "bio": d.get("bio", ""),
                    "languages": d.get("languages", ""),
                    "status": d.get("status", "approved"),
                    "registered_at": str(d.get("registered_at", "")),
                }
            )
        return jsonify({"success": True, "guides": guides})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/tourists/verify-guide", methods=["POST"])
def verify_guide():
    """
    In-person guide identity verification.
    Accepts: guideId + live photo (base64 or multipart).
    Compares live embedding against the guide's stored vector in Firestore.
    Returns: verified (bool), confidence (%), distance, guide info.
    """
    tmp = None
    try:
        # ── Parse input ──
        guide_id = None
        if request.content_type and "multipart" in request.content_type:
            guide_id = request.form.get("guideId") or request.form.get("guide_id")
            if "photo" not in request.files:
                return jsonify({"success": False, "error": "No photo provided."}), 400
            uploaded = request.files["photo"]
            tmp = os.path.join(TEMP_DIR, f"verify_{uuid.uuid4().hex}_{uploaded.filename}")
            uploaded.save(tmp)
        else:
            data = request.get_json() or {}
            guide_id = data.get("guideId") or data.get("guide_id")
            photo_b64 = data.get("photo")
            if not photo_b64:
                return jsonify({"success": False, "error": "No photo data provided."}), 400
            tmp = decode_base64_image(photo_b64)

        if not guide_id:
            return jsonify({"success": False, "error": "guideId is required."}), 400

        # ── Fetch guide document from Firestore ──
        doc_snapshot = db.collection("guides").document(guide_id).get()
        if not doc_snapshot.exists:
            return jsonify({"success": False, "error": f"Guide '{guide_id}' not found."}), 404

        guide_data = doc_snapshot.to_dict() or {}
        stored_embedding = guide_data.get("face_embedding")
        if not stored_embedding or not isinstance(stored_embedding, list):
            return (
                jsonify(
                    {"success": False, "error": "Guide has no stored face embedding vector."}
                ),
                400,
            )

        print(f"[INFO] Verifying guide: {guide_data.get('name')} (ID: {guide_id})")

        # ── Generate live embedding from tourist's snapshot (prefer FaceNet 512) ──
        used_model = "FaceNet"
        try:
            live_embedding = get_face_embedding(tmp, model_name=used_model)
        except Exception as e:
            print(f"[WARNING] FaceNet extraction failed: {e}. Trying VGG-Face fallback...")
            used_model = "VGG-Face"
            live_embedding = get_face_embedding(tmp, model_name=used_model)

        # If stored and live embeddings have different dimensions, attempt to match model
        if len(live_embedding) != len(stored_embedding):
            print(f"[WARN] Embedding size mismatch: live={len(live_embedding)} stored={len(stored_embedding)}")
            # If stored appears to be VGG-Face (4096) but we produced FaceNet (512), try VGG-Face
            if len(stored_embedding) == 4096 and used_model != "VGG-Face":
                try:
                    used_model = "VGG-Face"
                    live_embedding = get_face_embedding(tmp, model_name=used_model)
                except Exception as e:
                    cleanup_temp(tmp)
                    return jsonify({
                        "success": False,
                        "error": (
                            "Embedding dimension mismatch: stored embedding is 4096-dim but live embedding "
                            "could not be generated as 4096-dim (VGG-Face). Guide must re-register or server needs VGG-Face support."
                        ),
                    }), 400
            # If stored is 512 but live is different, try FaceNet
            elif len(stored_embedding) == 512 and used_model != "FaceNet":
                try:
                    used_model = "FaceNet"
                    live_embedding = get_face_embedding(tmp, model_name=used_model)
                except Exception as e:
                    cleanup_temp(tmp)
                    return jsonify({"success": False, "error": "Embedding dimension mismatch and FaceNet extraction failed."}), 400

        # ── Cosine distance comparison ──
        distance = float(cosine_distance(live_embedding, stored_embedding))
        threshold = 0.40 if DEEPFACE_AVAILABLE else 0.60
        verified = bool(distance < threshold)
        confidence = float(round((1.0 - distance) * 100, 1))

        engine = f"DeepFace {used_model}" if DEEPFACE_AVAILABLE else f"Simulator {used_model}"
        status_label = "VERIFIED" if verified else "NOT MATCHED"
        print(f"[{status_label}] Distance={distance:.4f}  Confidence={confidence}%  Engine={engine}")

        cleanup_temp(tmp)

        return jsonify(
            {
                "success": True,
                "verified": verified,
                "confidence": confidence,
                "distance": round(distance, 4),
                "threshold": float(threshold),
                "engine": engine,
                "guide": {
                    "id": doc_snapshot.id,
                    "name": guide_data.get("name", ""),
                    "phone": guide_data.get("phone", ""),
                },
            }
        )

    except Exception as e:
        traceback.print_exc()
        cleanup_temp(tmp)
        return jsonify({"success": False, "error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────
# 5. Firestore Document Schema Reference
# ─────────────────────────────────────────────────────────────────────────
"""
Collection: "guides"
Document Layout:
{
    "name":            "John Doe",
    "phone":           "+254712345678",
    "national_id":     "KE-12345678",
    "hourly_rate":     25.0,
    "bio":             "Experienced Nairobi city guide with 5 years...",
    "languages":       "English, Swahili, French",
    "face_embedding":  [0.0123, -0.0456, 0.0789, ...],   // 512-dim float array
    "status":          "approved",
    "registered_at":   "2026-06-16T15:00:00"              // or Firestore SERVER_TIMESTAMP
}
"""

# ─────────────────────────────────────────────────────────────────────────
# 6. Entry Point
# ─────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  SafeRoute — Tourism Guide Verification API Server")
    print(f"  Firestore : {'Mock Simulator' if USING_MOCK_FIRESTORE else 'Google Cloud'}")
    print(f"  DeepFace  : {'✓ Available' if DEEPFACE_AVAILABLE else '✗ Simulated'}")
    print(f"  Guides DB : {os.path.join(BASE_DIR, 'mock_guides.json') if USING_MOCK_FIRESTORE else 'Cloud'}")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=True)
