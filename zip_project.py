import os
import zipfile

def zip_directory(folder_path, zip_path):
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(folder_path):
            # Exclude .git directory
            if '.git' in dirs:
                dirs.remove('.git')
            
            for file in files:
                if file == 'zip_project.py' or file == 'project.zip':
                    continue
                file_path = os.path.join(root, file)
                # Calculate relative path to preserve folder structure
                arcname = os.path.relpath(file_path, folder_path)
                zipf.write(file_path, arcname)

if __name__ == "__main__":
    folder = os.getcwd()
    zip_output = os.path.join(folder, "project.zip")
    print(f"Zipping {folder} to {zip_output}...")
    zip_directory(folder, zip_output)
    print("Done!")
