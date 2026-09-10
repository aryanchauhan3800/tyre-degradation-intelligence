import sys
from pathlib import Path

# Ensure project root is in sys.path so backend.api.app can be imported
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.api.app import create_app

replay_path = str(root_dir / "data" / "replay" / "f1_2023_monza_q_ver.json")
model_path = str(root_dir / "data" / "ml" / "baseline_model.joblib")

app = create_app(replay_file=replay_path, model_path=model_path)
