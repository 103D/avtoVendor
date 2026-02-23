#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build Flask app to standalone exe
Run: python build_exe.py
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

def print_header(msg):
    print("\n" + "="*50)
    print(f"  {msg}")
    print("="*50 + "\n")

def main():
    print_header("Build Web app to EXE")
    
    project_root = Path(__file__).parent
    os.chdir(project_root)
    
    # Check Python
    print("[INFO] Checking Python...")
    try:
        python_version = subprocess.check_output([sys.executable, "--version"], text=True, encoding='utf-8')
        print(f"[OK] Python found: {python_version.strip()}")
    except:
        print("[ERROR] Python not found!")
        return False
    
    # Install dependencies
    print("[INFO] Installing dependencies...")
    try:
        subprocess.run(
            f'"{sys.executable}" -m pip install -q -r requirements.txt',
            shell=True,
            check=True,
            capture_output=True
        )
        print("[OK] Dependencies installed!")
    except:
        print("[ERROR] Failed to install dependencies!")
        return False
    
    # Clean old build
    print("[INFO] Cleaning old build...")
    for folder in ["build", "dist", "__pycache__"]:
        folder_path = project_root / folder
        if folder_path.exists():
            shutil.rmtree(folder_path)
            print(f"  Deleted: {folder}")
    
    # Remove old spec files
    for spec_file in project_root.glob("*.spec"):
        spec_file.unlink()
        print(f"  Deleted: {spec_file.name}")
    
    # Build with PyInstaller
    print_header("Building application")
    
    cmd = (
        f'"{sys.executable}" -m PyInstaller '
        '--onedir '
        '--noconsole '
        '--name WebApp '
        '--icon "app/ico.ico" '
        '--distpath ./dist '
        '--workpath ./build '
        '--specpath . '
        '--add-data "templates:templates" '
        '--add-data "static:static" '
        '--add-data "app:app" '
        '--hidden-import=flask '
        '--hidden-import=flask_session '
        '--hidden-import=pandas '
        '--hidden-import=openpyxl '
        '--hidden-import=xlrd '
        '--hidden-import=requests '
        '--hidden-import=urllib3 '
        '--hidden-import=docx '
        'run.py'
    )
    
    print(f"[INFO] Running PyInstaller...")
    print(f"[INFO] This may take 5-10 minutes on first run...")
    print()
    
    try:
        result = subprocess.run(cmd, shell=True, check=False)
        if result.returncode != 0:
            print("[ERROR] PyInstaller build failed!")
            return False
        print("\n[OK] PyInstaller build completed!")
    except Exception as e:
        print(f"[ERROR] Build error: {e}")
        return False
    
    # Check result
    dist_path = project_root / "dist" / "WebApp"
    if dist_path.exists():
        exe_file = dist_path / "WebApp.exe"
        if exe_file.exists():
            size_mb = sum(f.stat().st_size for f in dist_path.rglob('*') if f.is_file()) / (1024**2)
            print_header("SUCCESS! Build completed!")
            print(f"[OK] Exe file: {exe_file}")
            print(f"[OK] App folder: {dist_path}")
            print(f"[OK] Size: {size_mb:.1f} MB")
            print("\nYou can now:")
            print("1. Copy dist/WebApp folder to another computer")
            print("2. Run RUN_APP.bat to start")
            print("3. Or run WebApp.exe directly")
            return True
        else:
            print("[ERROR] Exe file not found!")
            return False
    else:
        print("[ERROR] dist folder not created!")
        # Debug info
        build_path = project_root / "build"
        if build_path.exists():
            print(f"[DEBUG] Build folder found, size: {sum(f.stat().st_size for f in build_path.rglob('*') if f.is_file()) / (1024**2):.1f} MB")
        return False

if __name__ == "__main__":
    success = main()
    if not success:
        print("\n[ERROR] Build failed!")
        sys.exit(1)
    else:
        print("\nPress Enter to exit...")
        input()
        sys.exit(0)
