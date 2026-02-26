#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
from pathlib import Path
import os
import logging

# Установим рабочую директорию в корень проекта и поместим её в начало sys.path
project_root = Path(__file__).parent.resolve()
os.chdir(str(project_root))
sys.path[0:0] = [str(project_root)]

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

    # Debug mode toggle: set environment variable AVTO_DEBUG=1 to enable console output and detailed logging
    debug_env = os.environ.get('AVTO_DEBUG', '1')

    # Configure logging to file and (optionally) console
    log_handlers = [logging.FileHandler('run_log.txt', encoding='utf-8')]
    if debug_env:
        log_handlers.append(logging.StreamHandler())
    logging.basicConfig(level=logging.DEBUG if debug_env else logging.INFO,
                        format='%(asctime)s %(levelname)s %(name)s: %(message)s',
                        handlers=log_handlers)

    # Optionally silence print() in non-debug runs to reduce noisy output
    if not debug_env:
        try:
            import builtins
            builtins.print = lambda *a, **k: None
        except Exception:
            pass

    app = create_app()
    app.run(debug=debug_env, host='0.0.0.0', port=5000)
