#!/bin/bash
echo "============================================"
echo "  Weave - Organisational Change Visualiser"
echo "  Starting server at http://localhost:8000"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""
php -S localhost:8000 router.php
