import json
import sys

def update_json(file_path, versions):
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    changed = False
    if 'dependencies' in data:
        for pkg, ver in versions.items():
            if pkg in data['dependencies']:
                new_ver = f"^{ver}"
                if data['dependencies'][pkg] != new_ver:
                    data['dependencies'][pkg] = new_ver
                    changed = True
    
    if changed:
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=4)
            f.write('\n')
        print(f"Updated {file_path}")
    else:
        print(f"No changes needed for {file_path}")

latest_versions = {
    "@napgram/auth-kit": "0.1.10",
    "@napgram/feature-kit": "0.1.18",
    "@napgram/gateway-kit": "0.1.14",
    "@napgram/infra-kit": "0.1.21",
    "@napgram/marketplace-kit": "0.2.4",
    "@napgram/media-kit": "0.1.11",
    "@napgram/message-kit": "0.1.14",
    "@napgram/plugin-adapter-telegram-mtcute": "0.1.7",
    "@napgram/plugin-admin-plugins": "0.1.5",
    "@napgram/plugin-kit": "0.1.21",
    "@napgram/plugin-permission-management": "0.1.2",
    "@napgram/plugin-qq-interaction": "0.1.5",
    "@napgram/request-kit": "0.1.11",
    "@napgram/runtime-kit": "0.1.21",
    "@napgram/telegram-client": "0.1.7",
    "@napgram/web-interfaces": "0.2.5",
    "@napgram/sdk": "0.1.21"
}

update_json('package.json', latest_versions)
update_json('main/package.json', latest_versions)
