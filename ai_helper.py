"""
AI service functions for natural language task parsing.
"""

import os
import json
from datetime import datetime, timedelta
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
load_dotenv()
DEEPSEEK_KEY = os.getenv("DEEPSEEK_API_KEY")

# Initialize OpenAI client (DeepSeek)
# 20s timeout to avoid long waits
client = OpenAI(
    api_key=DEEPSEEK_KEY, 
    base_url="https://api.deepseek.com/v1",
    timeout=20.0,  # 20s timeout
    max_retries=0  # No retries; fail fast and fallback
)

def parse_task_with_ai(user_input):
    """
    Parse natural-language task description with AI.

    Args:
        user_input (str): User's natural-language description.

    Returns:
        dict: Contains title, category, priority (and optionally subtasks).
    """
    print(f"\n{'='*60}")
    print(f"[AI parse start] user input: {user_input}")
    print(f"{'='*60}")
    
    try:
        system_prompt = _build_system_prompt()
        print(f"[System prompt] generated, length: {len(system_prompt)} chars")
        
        result = call_llm(user_input, system_prompt)
        print(f"[LLM raw response] {result}")
        
        # Validate and sanitize result
        validated = _validate_result(result, user_input)
        print(f"[Validated result] {validated}")
        print(f"{'='*60}\n")
        
        return validated
    
    except Exception as e:
        print(f"[AI parse failed] error type: {type(e).__name__}")
        print(f"[Error details] {str(e)}")
        print(f"[Fallback] returning basic result")
        print(f"{'='*60}\n")
        
        # Fallback: return basic result
        return {
            "title": user_input,
            "category": "Other",
            "priority": 2
        }

def call_llm(user_input, system_prompt):
    """Call OpenAI-compatible API (DeepSeek) for parsing."""
    print(f"[API request] model: deepseek-chat")
    print(f"[Request params] temperature=0, max_tokens=150")
    
    try:
        response = client.chat.completions.create( 
            model="deepseek-chat", 
            messages=[ 
                {"role": "user", "content": system_prompt},
                {"role": "user", "content": user_input}
            ],
            temperature=0,
            max_tokens=150 
        )
        
        print(f"[API response OK]")
        response_text = response.choices[0].message.content
        print(f"AI raw response: {response_text}")
        
        # Strip Markdown code fences (LLM may return ```json ... ```)
        clean_text = response_text.strip()
        if clean_text.startswith("```"):
            lines = clean_text.split('\n')
            lines = lines[1:]  # Drop first line (e.g. ```json)
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]  # Drop closing ```
            clean_text = '\n'.join(lines)
        
        print(f"Cleaned JSON: {clean_text}")
        return json.loads(clean_text)

    except Exception as e:
        print(f"[API call failed] {str(e)}")
        raise

#def _parse_with_gemini(user_input, system_prompt):
    #"""Parse using Gemini API."""
    #model = genai.GenerativeModel('gemini-pro')
    #prompt = f"{system_prompt}\n\nUser input: {user_input}"
    #response = model.generate_content(prompt)
    #return json.loads(response.text)

def _build_system_prompt():
    """Build the system prompt for task parsing."""
    today = datetime.now()
    
    return f"""
You are a Task Parsing Assistant. Current date: {today.strftime('%Y-%m-%d')}

Analyze the user's task description and return a strict JSON in the following format:

{{
    "title": "Task title (concise and clear)",
    "category": "Study/Work/Life/Other",
    "priority": 1 or 2 or 3,
    "subtasks": ["Subtask 1", "Subtask 2"] (optional, for complex tasks)
}}


Priority Rules:

Contains "urgent", "important", "asap", or close to today → 1 (High)

Contains "not urgent", "when free", "later", or far from today → 3 (Low)

Others → 2 (Medium)

Category Recognition:

Study-related (homework, exams, courses) → Study

Work-related (meetings, projects, tasks) → Work

Daily life (shopping, exercise, chores) → Life

Other → Other

Task Decomposition:

title + subtasks must cover all information from the user input. You may add decomposed subtasks but must not remove any information.

For large/complex tasks (e.g., "Complete Final Project"), automatically split into 2–6 subtasks in the subtasks array. Each subtask should take approximately 30 minutes–2 hours.

For simple tasks (e.g., "Buy milk"), return an empty array [] for subtasks.

If the task has nested or hierarchical elements, extract the main content as title and include other related items in subtasks.

If the task contains special terms or unclear intent, return the original input as title.

Language:

Use the language of the user input. If multiple languages are present, default to English.

Format:

Return pure JSON only, without any additional text.

Do not include Markdown code blocks or formatting.
"""

def _validate_result(result, user_input):
    """Validate and sanitize AI response."""
    print(f"[Validation] raw result: {result}")
    
    valid_categories = ['Study', 'Work', 'Life', 'Other']
    valid_priorities = [1, 2, 3]
    
    # Validate category
    if result.get('category') not in valid_categories:
        result['category'] = 'Other'
    
    # Validate priority
    if result.get('priority') not in valid_priorities:
        result['priority'] = 2
    
    # Validate title
    if not result.get('title') or len(result['title'].strip()) == 0:
        result['title'] = user_input
    
    return result


def test_ai_connection():
    """Test AI API connection."""
    try:
        test_result = parse_task_with_ai("test")
        return True, "AI connection OK"
    except Exception as e:
        return False, f"AI connection failed: {str(e)}"
