#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
from pathlib import Path

# Добавить папку app в путь
sys.path.insert(0, str(Path(__file__).parent))

from app import create_app

if __name__ == '__main__':
    # Ensure stdout/stderr use UTF-8 where possible to avoid Windows encoding errors
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass
    app = create_app()  
    app.run(debug=True, host='0.0.0.0', port=5000)
