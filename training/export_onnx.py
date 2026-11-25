"""Export the helmet model to the ONNX file the web app loads.

    python training/export_onnx.py

The full-precision export is 175 MB. Large weight tensors are stored as 16-bit
floats and cast back to 32-bit inside the graph, which halves the file to 87 MB
while giving the same detections as the full-precision model. Dynamic int8
quantisation was tried and rejected: it cut the file to 44 MB but moved
"no helmet" confidences by up to 0.2, which changes which riders get a challan.
"""

from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/public/models/helmet-yolov8l.onnx"


def store_weights_as_fp16(path: Path, out: Path, min_size: int = 1024) -> None:
    model = onnx.load(str(path))
    graph = model.graph
    casts, halves = [], []
    for init in list(graph.initializer):
        if init.data_type == TensorProto.FLOAT and int(np.prod(init.dims)) > min_size:
            halves.append(numpy_helper.from_array(numpy_helper.to_array(init).astype(np.float16), init.name + "_fp16"))
            casts.append(helper.make_node("Cast", [init.name + "_fp16"], [init.name], to=TensorProto.FLOAT, name=init.name + "_cast"))
            graph.initializer.remove(init)
    graph.initializer.extend(halves)
    nodes = list(graph.node)
    del graph.node[:]
    graph.node.extend(casts + nodes)
    onnx.checker.check_model(model)
    onnx.save(model, str(out))


def main() -> None:
    full = Path(YOLO(str(ROOT / "models/helmet-yolov8l.pt")).export(format="onnx", imgsz=640, opset=12, simplify=False))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    store_weights_as_fp16(full, OUT)
    print(f"{OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
