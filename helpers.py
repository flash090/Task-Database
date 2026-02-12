"""
Database helper functions for task management.
"""

import requests

from flask import redirect, render_template, session
from functools import wraps
from cs50 import SQL


db = SQL("sqlite:///tododata.db")

def init_db():
    """Initialize database tables."""
    db.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            title TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            priority INTEGER DEFAULT 2,
            category TEXT DEFAULT 'Other',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    db.execute("""
        CREATE TABLE IF NOT EXISTS subtasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
""")

def get_all_tasks(session_id):
    """Get all tasks for the session."""
    return db.execute(
        "SELECT * FROM tasks WHERE session_id = ? ORDER BY completed ASC, created_at ASC",
        session_id
    )

def get_subtasks(task_id):
    """Get all subtasks for a task."""
    return db.execute(
        "SELECT id, title, completed FROM subtasks WHERE task_id = ? ORDER BY id",
        task_id
    )

def create_task(session_id, title, priority=2, category='Other'):
    """Create a new task."""
    return db.execute(
        """INSERT INTO tasks (session_id, title, priority, category) 
           VALUES (?, ?, ?, ?)""",
        session_id, title, priority, category
    )

def create_subtask(task_id, title):
    """Create a single subtask."""
    return db.execute(
        "INSERT INTO subtasks (task_id, title) VALUES (?, ?)",
        task_id, title
    )


def update_task_status(task_id, session_id, completed):
    """Update task completion status."""
    db.execute(
        "UPDATE tasks SET completed = ? WHERE id = ? AND session_id = ?",
        completed, task_id, session_id
    )

def update_task_title(task_id, session_id, title):
    """Update task title."""
    db.execute(
        "UPDATE tasks SET title = ? WHERE id = ? AND session_id = ?",
        title, task_id, session_id
    )

def update_task_priority(task_id, session_id, priority):
    """Update task priority."""
    db.execute(
        "UPDATE tasks SET priority = ? WHERE id = ? AND session_id = ?",
        priority, task_id, session_id
    )

def update_task_category(task_id, session_id, category):
    """Update task category."""
    db.execute(
        "UPDATE tasks SET category = ? WHERE id = ? AND session_id = ?",
        category, task_id, session_id
    )

def delete_task(task_id, session_id):
    """Delete a task."""
    db.execute(
        "DELETE FROM tasks WHERE id = ? AND session_id = ?",
        task_id, session_id
    )

# --- Subtask helpers ---

def update_subtask_status(subtask_id, completed):
    """Update subtask completion status."""
    db.execute(
        "UPDATE subtasks SET completed = ? WHERE id = ?",
        completed, subtask_id
    )

def update_subtask_title(subtask_id, title):
    """Update subtask title."""
    db.execute(
        "UPDATE subtasks SET title = ? WHERE id = ?",
        title, subtask_id
    )

def delete_subtask(subtask_id):
    """Delete a subtask."""
    db.execute("DELETE FROM subtasks WHERE id = ?", subtask_id)

