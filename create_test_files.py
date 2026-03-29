from PIL import Image

# Create a small test image
img = Image.new('RGB', (100, 100), color='red')
img.save('tests/test-image.png')

# Create a small test project json
import json
project_data = {
    "version": 7,
    "page": "creator",
    "settings": {"sW": 10, "sH": 10, "fabricCt": 14},
    "pattern": [{"id": "310", "type": "solid", "rgb": [0,0,0]} for _ in range(100)],
    "bsLines": [],
    "totalTime": 0,
    "sessions": []
}
with open('tests/test-project.json', 'w') as f:
    json.dump(project_data, f)
