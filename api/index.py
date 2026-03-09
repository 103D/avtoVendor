from app import create_app

# Vercel Python runtime looks for a WSGI app named `app`.
app = create_app()
