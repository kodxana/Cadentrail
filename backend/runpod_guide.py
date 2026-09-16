"""Portable Runpod companion guidance; no account credentials or infrastructure calls."""
from pathlib import Path
import io, json
from zipfile import ZipFile, ZIP_DEFLATED
from .version import VERSION

SKILL_PATH = Path(__file__).parent / 'skills' / 'cadentrail-runpod' / 'SKILL.md'
OFFICIAL_URL = 'https://github.com/runpod/runpod-plugins-official'


def runpod_document():
    return {
        'name': 'Cadentrail + Runpod skills',
        'author': 'Madiator2011',
        'officialSkillsUrl': OFFICIAL_URL,
        'installCommand': 'npx skills add runpod/runpod-plugins-official',
        'mcpSetupCommand': 'npx @runpod/mcp-server@latest add',
        'runpodMcpUrl': 'https://mcp.getrunpod.io/',
        'skillPath': '/api/integrations/runpod/SKILL.md',
        'resourceUri': 'cadentrail://runpod',
        'reconnectKitPath': '/api/integrations/runpod/reconnect.zip',
        'discovery': {'serverName': 'cadentrail', 'imageRepository': 'madiator2011/cadentrail',
                      'httpPort': 8000, 'mcpPath': '/api/mcp', 'healthPath': '/health',
                      'identityPath': '/api/session', 'identityField': 'workstationId',
                      'selection': 'unique account-verified Pod with the expected workstation identity',
                      'configUpdate': 'existing Cadentrail entry URL only; preserve credentials and other settings'},
        'deployment': {
            'image': f'madiator2011/cadentrail:{VERSION}',
            'cloud': 'SECURE',
            'testedGpu': 'NVIDIA GeForce RTX 4090 (24 GB)',
            'httpPort': 8000,
            'volumeMountPath': '/workspace',
            'env': {'DAW_STORAGE': '/workspace/yue2-daw'},
            'healthPath': '/health',
            'note': 'Release defaults, not a reading of your Pod. Verify current pricing, storage capacity and image digest before deployment.',
        },
        'text': SKILL_PATH.read_text(encoding='utf-8'),
    }


def reconnect_kit(workstation_id):
    profile = {
        'schemaVersion': 1, 'serverName': 'cadentrail',
        'expectedWorkstationId': workstation_id,
        'imageRepository': 'madiator2011/cadentrail', 'httpPort': 8000,
        'mcpPath': '/api/mcp', 'healthPath': '/health',
        'identityPath': '/api/session', 'identityField': 'workstationId',
    }
    output = io.BytesIO()
    with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
        archive.writestr('cadentrail-runpod/SKILL.md', SKILL_PATH.read_bytes())
        archive.writestr('cadentrail-runpod/references/connection.json', json.dumps(profile, indent=2)+'\n')
    return output.getvalue()
