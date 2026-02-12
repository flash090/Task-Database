"""
Main application file.
"""

import os
import secrets
from datetime import timedelta
from flask import Flask, render_template, request, jsonify, session
from flask_session import Session
from dotenv import load_dotenv
from cs50 import SQL

# Import custom modules
from helpers import (
    init_db, get_all_tasks, get_subtasks, create_task, create_subtask,
    update_task_status, update_task_title, update_task_priority, update_task_category,
    update_subtask_status, update_subtask_title,
    delete_task, delete_subtask
)
from ai_helper import parse_task_with_ai, test_ai_connection

# Load environment variables
load_dotenv()

# Configure Flask application
app = Flask(__name__)

# Session permanent and security settings
app.config.update(
    SESSION_PERMANENT=True,
    PERMANENT_SESSION_LIFETIME=timedelta(days=365),  # Persist for 365 days
    SESSION_TYPE="filesystem",
    SECRET_KEY=os.getenv("SECRET_KEY", "dev-secret-key-change-in-production"),
    SESSION_COOKIE_HTTPONLY=True,     # Mitigate XSS
    SESSION_COOKIE_SAMESITE="Lax",    # Mitigate CSRF
    SESSION_COOKIE_SECURE=False       # False for local dev; set True in production
)
Session(app)


# Initialize database
db = SQL("sqlite:///tododata.db")

init_db()


# ============ Middleware ============
@app.before_request
def ensure_permanent_session():
    session.permanent = True
    print(f"session used:{session.sid}")

@app.before_request
def ensure_session():
    """Ensure every user has a session_id."""
    session.permanent = True  # Mark session as permanent
    if 'session_id' not in session:
        session['session_id'] = secrets.token_hex(16)
        print(f"New session created: {session['session_id']}")


# ============ Page routes ============

@app.route("/")
def home():
    """Main page."""
    return render_template("home.html")

# ============ API routes ============

@app.route("/api/tasks", methods=["GET"])
def api_get_tasks():
    """Get all tasks."""
    try:
        tasks = get_all_tasks(session['session_id'])
        for task in tasks:
            task['subtasks'] = get_subtasks(task['id'])
        return jsonify(tasks)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/tasks", methods=["POST"])
def api_create_task():
    """Create new task (manual or after AI confirmation) and create subtasks."""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('title'):
            return jsonify({"error": "Title is required"}), 400
        
        # Create task
        task_id = create_task(
            session['session_id'],
            data['title'],
            data.get('priority', '2'),
            data.get('category', 'Other'),
        )
        
        # If request includes subtasks (AI-generated or manual batch), create in a loop
        if 'subtasks' in data and isinstance(data['subtasks'], list):
            for sub_title in data['subtasks']:
                if sub_title and str(sub_title).strip():
                    create_subtask(task_id, str(sub_title).strip())
    
        return jsonify({"success": True, "task_id": task_id})
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/tasks/<int:task_id>/subtasks", methods=["POST"])
def api_add_subtask(task_id):
    """Manually add a single subtask."""
    try:
        data = request.get_json()
        title = data.get('title', '').strip()
        
        # Only create if title is non-empty; otherwise return success (silent fail)
        if title:
            subtask_id = create_subtask(task_id, title)
            return jsonify({"success": True, "id": subtask_id})
            
        return jsonify({"success": True, "id": None})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/subtasks/<int:subtask_id>", methods=["PATCH"])
def api_update_subtask(subtask_id):
    """Update subtask."""
    try:
        data = request.get_json()
        
        if 'completed' in data:
            update_subtask_status(subtask_id, data['completed'])
            
        if 'title' in data:
            title = str(data['title']).strip()
            # Lenient: treat empty title as space
            if not title:
                title = " "
            update_subtask_title(subtask_id, title)
            
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/subtasks/<int:subtask_id>", methods=["DELETE"])
def api_delete_subtask(subtask_id):
    """Delete subtask."""
    try:
        delete_subtask(subtask_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/tasks/<int:task_id>", methods=["PATCH"])
def api_update_task(task_id):
    """Partially update main task attributes."""
    try:
        data = request.get_json()
        
        # 1. Update completion status
        if 'completed' in data:
            update_task_status(task_id, session['session_id'], data['completed'])
        
        # 2. Update title
        if 'title' in data:
            new_title = data['title'].strip()
            # If user sends empty, store a space instead of erroring
            if not new_title:
                new_title = " " 
            update_task_title(task_id, session['session_id'], new_title)
            
        # 3. Update priority
        if 'priority' in data:
            try:
                priority = int(data['priority'])
                if priority not in [1, 2, 3]:
                    priority = 2  # Default to medium if invalid
            except (ValueError, TypeError):
                priority = 2      # Default to medium on parse failure
            update_task_priority(task_id, session['session_id'], priority)

        # 4. Update category
        if 'category' in data:
            category = str(data['category']).strip()
            valid_categories = ['Study', 'Work', 'Life', 'Other']
            if category not in valid_categories:
                category = 'Other'  # Default to Other if invalid
            update_task_category(task_id, session['session_id'], category)
        
        return jsonify({"success": True})
    
    except Exception as e:
        print(f"Update task error: {e}")  # Log error
        return jsonify({"error": str(e)}), 500

@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def api_delete_task(task_id):
    """Delete task."""
    try:
        delete_task(task_id, session['session_id'])
        return jsonify({"success": True})
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/ai-parse", methods=["POST"])
def api_ai_parse():
    """Parse natural-language task with AI."""
    try:
        data = request.get_json()
        user_input = data.get('input', '').strip()
        
        if not user_input:
            return jsonify({"error": "Input is required"}), 400
        
        # Call AI parse
        result = parse_task_with_ai(user_input)
        
        return jsonify(result)
    
    except Exception as e:
        print(f"AI parse error: {e}")
        # Fallback
        return jsonify({
            "title": data.get('input', 'Untitled'),
            "category": "Other",
            "priority": 2
        })

# ============ Debug / test routes ============

@app.route("/api/test-ai")
def test_ai():
    """Test AI connection."""
    success, message = test_ai_connection()
    return jsonify({"success": success, "message": message})

@app.route("/api/debug")
def debug():
    """Debug info."""
    return jsonify({
        "session_id": session.get('session_id'),
        "task_count": len(get_all_tasks(session['session_id'])),
        "ai_provider": os.getenv('AI_PROVIDER', 'openai')
    })

# ============ Error handling ============

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Server error"}), 500

# ============ Run application ============

if __name__ == '__main__':
    app.run(debug=True)
