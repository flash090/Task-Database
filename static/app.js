/*********************************
 * 1. Global State
 *********************************/


// 唯一状态源：当前正在编辑的对象
let editingTarget = {
    type: null, // 'task_title' | 'task_priority' | 'task_category' | 'subtask' | null
    id: null    // task.id or subtask.id
};

let currentTasks = [];
let currentAISuggestion = null;

// 筛选状态
let filterPriority = 'all';  // 'all' | '1' | '2' | '3'
let filterCategory = 'all';  // 'all' | 'Study' | 'Work' | 'Life' | 'Other'

/*********************************
 * 2. API Layer
 *********************************/

async function fetchTasks() {
    try {
        console.log("fetchTasks called");
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'block';
        const res = await fetch('/api/tasks');
        const tasks = await res.json();
        console.log("tasks from server", tasks);
        currentTasks = tasks;
        if (loadingEl) loadingEl.style.display = 'none';
        return tasks;
    } catch (e) {
        console.error('Fetch error:', e);
        return [];
    }
}

async function patchTask(id, payload) {
    try {
        await fetch(`/api/tasks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        await fetchTasks();
        renderRouter();
    } catch (e) {
        console.error('Patch Task Error:', e);
    }
}

async function createSubtask(taskId, title = 'New Subtask') {
    try {
        const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        const data = await res.json();
        await fetchTasks();
        renderRouter();
        return data.id;
    } catch (e) {
        console.error('Create Subtask Error:', e);
        return null;
    }
}
async function handleAddSubtask(taskId) {
    // 创建新子任务并自动进入编辑模式
    const newId = await createSubtask(taskId, "New Subtask");
    if (newId) {
        enterEdit('subtask', newId);
        // 选中文本以便快速替换
        setTimeout(() => {
            const input = document.getElementById(`edit-subtask-${newId}`);
            if (input) input.select();
        }, 50);
    }
}

async function patchSubtask(id, payload) {
    try {
        await fetch(`/api/subtasks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        await fetchTasks();
        renderRouter();
    } catch (e) {
        console.error('Patch Subtask Error:', e);
    }
}

async function deleteSubtask(id) {
    try {
        await fetch(`/api/subtasks/${id}`, { method: 'DELETE' });
        await fetchTasks();
        renderRouter();
    } catch (e) {
        console.error('Delete Subtask Error:', e);
    }
}

// 仅删除主任务 (连带子任务)
async function deleteTask(id) {
    if (!confirm("Are you sure you want to delete this task?")) return;
    try {
        await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        await fetchTasks();
        renderRouter();
    } catch (e) {
        console.error('Delete Task Error:', e);
    }
}

async function createTask(payload) {
    try {
        await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        await fetchTasks();
        renderRouter();
    } catch (e) {
        console.error('Create Task Error:', e);
    }
}

/*********************************
 * 3. Render Layer
 *********************************/

// 筛选函数
function applyFilter() {
    filterPriority = document.getElementById('filter-priority').value;
    filterCategory = document.getElementById('filter-category').value;
    renderRouter();
}

function renderRouter() {
    const taskListEl = document.getElementById('task-list');
    const taskCountEl = document.getElementById('task-count');
    const emptyStateEl = document.getElementById('empty-state');

    // 应用筛选
    let filteredTasks = currentTasks.filter(task => {
        if (filterPriority !== 'all' && task.priority != filterPriority) return false;
        if (filterCategory !== 'all' && task.category !== filterCategory) return false;
        return true;
    });

    // 当选择 All Priority 时，按优先级 1-2-3 排序
    if (filterPriority === 'all') {
        filteredTasks = filteredTasks.sort((a, b) => a.priority - b.priority);
    }

    if (taskCountEl) taskCountEl.textContent = filteredTasks.length;

    if (filteredTasks.length === 0) {
        if (emptyStateEl) emptyStateEl.style.display = 'block';
        taskListEl.innerHTML = '';
        return;
    }

    if (emptyStateEl) emptyStateEl.style.display = 'none';

    // 重新渲染列表
    taskListEl.innerHTML = filteredTasks.map(task => renderTaskItem(task)).join('');
}

function renderTaskItem(task) {
    const isCompleted = task.completed === 1;
    const completedClass = isCompleted ? 'opacity-50' : '';

    // Check if any part of this task is being edited
    const isEditingTitle = (editingTarget.type === 'task_title' && editingTarget.id === task.id);
    const isEditingPriority = (editingTarget.type === 'task_priority' && editingTarget.id === task.id);
    const isEditingCategory = (editingTarget.type === 'task_category' && editingTarget.id === task.id);

    // Also check if any subtask of this task is being edited
    const isEditingAnySubtask = (task.subtasks || []).some(sub =>
        editingTarget.type === 'subtask' && editingTarget.id === sub.id
    );

    const showX = isEditingTitle || isEditingPriority || isEditingCategory;
    // Plus button shows if ANY edit is happening on this task (main or sub)
    const showPlus = isEditingTitle || isEditingPriority || isEditingCategory || isEditingAnySubtask;

    return `
        <div class="card mb-2 shadow-sm task-card ${completedClass}" data-task-id="${task.id}">
            <div class="card-body py-2">
                <!-- Header Row -->
                <div class="d-flex align-items-center mb-1 flex-wrap gap-2">
                    <input type="checkbox" class="form-check-input me-2 mt-0"
                           ${isCompleted ? 'checked' : ''}
                           onchange="handleTaskComplete(${task.id}, this.checked)">
                    
                    <div class="d-flex align-items-center flex-wrap gap-2">
                        ${renderTitle(task, isEditingTitle)}
                        
                        <!-- Right-aligned controls wrapper -->
                        <div class="ms-auto d-flex align-items-center gap-2">
                            ${renderPriority(task, isEditingPriority)}
                            ${renderCategory(task, isEditingCategory)}
                        </div>
                    </div>

                    ${showX ? renderDeleteTaskBtn(task.id) : ''}
                </div>

                <!-- Subtasks Container -->
                <div class="subtasks-container ps-4 border-start ms-2 mb-2">
                    ${renderSubtasks(task.subtasks || [], task.id)}
                    
                    <!-- Plus Button Row - Moved to end of subtasks -->
                    ${showPlus ?
            `<div class="mt-1">
                            <button class="btn btn-sm btn-link text-primary p-0 text-decoration-none" 
                                    onclick="handleAddSubtask(${task.id})" title="Add Subtask">
                                <i class="bi bi-plus-lg"></i>
                            </button>
                        </div>` : ''
        }
                </div>
            </div>
        </div>
    `;
}

function renderTitle(task, isEditing) {
    if (isEditing) {
        // Wrap in flex-grow-1 div so the input can be smaller but space is preserved
        // Input itself is width: auto, not full width
        return `<div class="flex-grow-1">
                    <input type="text" class="form-control form-control-sm" 
                           style="width: 300px; max-width: 100%;"
                           value="${escapeHtml(task.title)}" 
                           id="edit-title-${task.id}"
                           onblur="handleBlur('task_title', ${task.id})"
                           onkeypress="handleEnter(event, 'task_title', ${task.id})">
                </div>`;
    }
    const completedStyle = task.completed ? 'text-decoration-line-through text-muted' : 'fw-medium';
    return `<span class="task-title-text flex-grow-1 ${completedStyle}" 
                  onclick="enterEdit('task_title', ${task.id})"
                  title="Click to edit">
                ${escapeHtml(task.title)}
            </span>`;
}

function renderPriority(task, isEditing) {
    const map = { 1: { class: 'danger', text: '1' }, 2: { class: 'warning', text: '2' }, 3: { class: 'secondary', text: '3' } };
    const conf = map[task.priority] || map[2];

    if (isEditing) {
        return `<select class="form-select form-select-sm" style="width: auto; display: inline-block;" 
                        id="edit-priority-${task.id}"
                        onblur="handleBlur('task_priority', ${task.id})"
                        onchange="handleBlur('task_priority', ${task.id})">
                    <option value="1" ${task.priority === 1 ? 'selected' : ''}>1</option>
                    <option value="2" ${task.priority === 2 ? 'selected' : ''}>2</option>
                    <option value="3" ${task.priority === 3 ? 'selected' : ''}>3</option>
                </select>`;
    }
    return `<span class="badge bg-${conf.class} cursor-pointer" 
                  onclick="enterEdit('task_priority', ${task.id})"
                  title="Edit priority">
                ${conf.text}
            </span>`;
}

function renderCategory(task, isEditing) {
    const opts = ['Study', 'Work', 'Life', 'Other'];
    if (isEditing) {
        return `<select class="form-select form-select-sm" style="width: auto; display: inline-block;" 
                        id="edit-category-${task.id}"
                        onblur="handleBlur('task_category', ${task.id})"
                        onchange="handleBlur('task_category', ${task.id})">
                    ${opts.map(o => `<option value="${o}" ${task.category === o ? 'selected' : ''}>${o}</option>`).join('')}
                </select>`;
    }
    return `<span class="badge bg-light text-dark border cursor-pointer" 
                  onclick="enterEdit('task_category', ${task.id})"
                  title="Edit category">
                ${escapeHtml(task.category)}
            </span>`;
}

function renderDeleteTaskBtn(taskId) {
    // Style: simple 'x', no text. using bi-x-lg or bi-x
    // Ensure z-index or position doesn't hide it. 
    return `<button class="btn btn-sm btn-link text-danger p-0 ms-2 text-decoration-none" 
                    onmousedown="deleteTask(${taskId})" 
                    title="Delete Task">
                <i class="bi bi-x-lg"></i>
            </button>`;
}

function renderSubtasks(subtasks, taskId) {
    if (!subtasks || subtasks.length === 0) return '';
    return subtasks.map(sub => renderSubtaskItem(sub, taskId)).join('');
}

function renderSubtaskItem(sub, taskId) {
    const isEditing = (editingTarget.type === 'subtask' && editingTarget.id === sub.id);
    const completedStyle = sub.completed ? 'text-decoration-line-through text-muted opacity-75' : '';

    let content = '';
    if (isEditing) {
        content = `
            <div class="d-flex align-items-center w-100 mb-1">
                 <input type="checkbox" disabled class="form-check-input me-2" style="transform: scale(0.9); opacity:0.5;">
                 <input type="text" class="form-control form-control-sm" 
                        value="${escapeHtml(sub.title)}"
                        id="edit-subtask-${sub.id}"
                        onblur="handleBlur('subtask', ${sub.id})"
                        onkeypress="handleEnter(event, 'subtask', ${sub.id})"
                        placeholder="Empty to delete">
                 
                 <!-- Subtask Edit Mode '+' Button (Inline/Sibling logic not needed here if global Add is at bottom, 
                      User asked for "Add to be at the end of list". So we remove individual + here) -->
            </div>
        `;
    } else {
        content = `
            <div class="subtask-item d-flex align-items-center mb-1">
                <input type="checkbox" class="form-check-input me-2" 
                       style="transform: scale(0.9);"
                       ${sub.completed ? 'checked' : ''}
                       onchange="handleSubtaskComplete(${sub.id}, this.checked)">
                <span class="${completedStyle} cursor-pointer flex-grow-1"
                      onclick="enterEdit('subtask', ${sub.id})">
                    ${escapeHtml(sub.title)}
                </span>
            </div>
        `;
    }
    return content;
}


/*********************************
 * 4. Interaction Layer
 *********************************/

function enterEdit(type, id) {
    editingTarget = { type, id };
    renderRouter();

    // Auto focus
    setTimeout(() => {
        let elId = '';
        if (type === 'task_title') elId = `edit-title-${id}`;
        if (type === 'task_priority') elId = `edit-priority-${id}`;
        if (type === 'task_category') elId = `edit-category-${id}`;
        if (type === 'subtask') elId = `edit-subtask-${id}`;

        const el = document.getElementById(elId);
        if (el) el.focus();
    }, 0);
}

// Global exit edit when clicking outside handled by individual blurs?
// Ideally clicking outside blurs the input, which triggers handleBlur -> saves -> exits edit.
// So we just need robust handleBlur.

function handleBlur(type, id) {
    // Small delay to allow 'onmousedown' events (like delete btn) to fire first
    setTimeout(() => {
        // If we are still editing this item, save and exit
        if (editingTarget.type === type && editingTarget.id === id) {
            saveAndExit(type, id);
        }
    }, 150);
}

function handleEnter(e, type, id) {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveAndExit(type, id);
    }
}

async function saveAndExit(type, id) {
    editingTarget = { type: null, id: null }; // Clear state immediately to UI reset upon re-render
    // But we need values first

    // We can't query selector easily after re-render if we clear state first?
    // Actually, we must read value BEFORE re-render.
    let val = null;
    let elId = '';

    if (type === 'task_title') elId = `edit-title-${id}`;
    if (type === 'task_priority') elId = `edit-priority-${id}`;
    if (type === 'task_category') elId = `edit-category-${id}`;
    if (type === 'subtask') elId = `edit-subtask-${id}`;

    // The element should still be in DOM
    const el = document.getElementById(elId);
    if (el) val = el.value;

    // Reset UI now to look responsive
    // renderRouter(); // Wait, if API fails? Optimistic UI?
    // Let's do API then render. But user input remains until API done? 
    // Usually 'Blur' implies we are done editing.
    // Let's read value, then call API, API will re-fetch and re-render.

    if (val === null) {
        renderRouter(); // Just reset
        return;
    }

    if (type === 'task_title') {
        if (val.trim()) await patchTask(id, { title: val.trim() });
        else renderRouter(); // Revert if empty? Or delete? Safety: revert or ignore.
    }
    if (type === 'task_priority') await patchTask(id, { priority: parseInt(val) });
    if (type === 'task_category') await patchTask(id, { category: val });

    if (type === 'subtask') {
        const title = val.trim();
        if (!title) await deleteSubtask(id);
        else await patchSubtask(id, { title });
    }
}


function handleTaskComplete(id, isChecked) {
    patchTask(id, { completed: isChecked ? 1 : 0 });
}

function handleSubtaskComplete(id, isChecked) {
    patchSubtask(id, { completed: isChecked ? 1 : 0 });
}


/*********************************
 * 5. Quick Add & AI (Legacy/Existing)
 *********************************/

async function quickAddTask() {
    const titleEl = document.getElementById('quick-add-title');
    const catEl = document.getElementById('quick-add-category');
    const priEl = document.getElementById('quick-add-priority');

    const title = titleEl.value.trim();
    if (!title) return;

    await createTask({
        title,
        category: catEl.value || 'Other',
        priority: parseInt(priEl.value || '2')
    });

    titleEl.value = '';
}

// AI 模块保持原有逻辑，只是 refresh 变成 fetchTasks
async function askAI() {
    const input = document.querySelector('#ai-input').value.trim();
    if (!input) { alert('Please enter text'); return; }

    setAILoading(true);
    try {
        const res = await fetch('/api/ai-parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input })
        });
        const data = await res.json();
        if (data.error) alert(data.error);
        else showAISuggestion(data);
    } catch (e) {
        console.error(e);
        alert('AI Request Failed');
    } finally {
        setAILoading(false);
    }
}

function showAISuggestion(data) {
    currentAISuggestion = data;
    document.getElementById('ai-title').value = data.title || '';
    document.getElementById('ai-category').value = data.category || 'Other';
    document.getElementById('ai-priority').value = data.priority || 2;

    const container = document.getElementById('ai-subtasks-container');
    container.innerHTML = '';
    (data.subtasks || []).forEach((sub, i) => {
        container.innerHTML += `
            <div class="d-flex align-items-center mb-2">
                <i class="bi bi-dot text-secondary"></i>
                <input type="text" class="form-control form-control-sm border-0 bg-transparent ai-subtask-input" 
                       value="${escapeHtml(sub)}">
            </div>
        `;
    });
    document.getElementById('ai-preview').style.display = 'block';
}

async function confirmAI() {
    const title = document.getElementById('ai-title').value.trim();
    const category = document.getElementById('ai-category').value;
    const priority = parseInt(document.getElementById('ai-priority').value);

    const subInputs = document.querySelectorAll('.ai-subtask-input');
    const subtasks = Array.from(subInputs).map(i => i.value.trim()).filter(Boolean);

    if (!title) return;

    await createTask({ title, category, priority, subtasks });
    cancelAI();
    document.getElementById('ai-input').value = '';
}

function cancelAI() {
    document.getElementById('ai-preview').style.display = 'none';
    currentAISuggestion = null;
}

function setAILoading(loading) {
    const spinner = document.getElementById('ai-loading');
    const text = document.getElementById('ai-btn-text');
    const btn = document.querySelector('#ai-input + button');
    if (loading) {
        spinner.classList.remove('d-none');
        text.classList.add('d-none');
        btn.disabled = true;
    } else {
        spinner.classList.add('d-none');
        text.classList.remove('d-none');
        btn.disabled = false;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}


/*********************************
 * 6. Bootstrap
 *********************************/
document.addEventListener('DOMContentLoaded', async () => {
    await fetchTasks();
    renderRouter();

    // Quick Add Enter Key
    const qa = document.getElementById('quick-add-title');
    if (qa) qa.addEventListener('keypress', e => { if (e.key === 'Enter') quickAddTask(); });

    const ai = document.getElementById('ai-input');
    if (ai) ai.addEventListener('keypress', e => { if (e.key === 'Enter') askAI(); });
});
