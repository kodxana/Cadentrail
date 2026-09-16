"""Run under the isolated alignment Python in a network-disabled image."""
import sys,tempfile,json
from pathlib import Path
sys.path.insert(0,'/app')
from backend.model_runtime import model_path
from nemo.collections.asr.models import SortformerEncLabelModel
with tempfile.TemporaryDirectory() as folder:
    path=model_path(Path(folder),'sortformer')/'diar_streaming_sortformer_4spk-v2.1.nemo'
    model=SortformerEncLabelModel.restore_from(str(path),map_location='cpu',strict=True).eval()
    print(json.dumps({'offlineSortformerRestore':True,'parameters':sum(p.numel() for p in model.parameters()),'model':str(path)}),flush=True)
