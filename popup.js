document.addEventListener('DOMContentLoaded', () => {
    const noteInput = document.getElementById('noteInput');
    const saveButton = document.getElementById('saveNote');
    const notesList = document.getElementById('notesList');
    const searchInput = document.getElementById('searchInput');
    const categorySelect = document.getElementById('noteCategory');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const exportButton = document.getElementById('exportNotes');
    const clearAllButton = document.getElementById('clearAll');

    let currentFilter = 'all';
    let searchTerm = '';

    // تحميل الملاحظات المحفوظة
    loadNotes();

    // البحث في الملاحظات
    searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value.toLowerCase();
        loadNotes();
    });

    // حفظ ملاحظة جديدة
    saveButton.addEventListener('click', () => {
        const noteText = noteInput.value.trim();
        if (noteText) {
            saveNote(noteText, categorySelect.value);
            noteInput.value = '';
            showToast('تم حفظ الملاحظة بناح', 'success');
        }
    });

    // إضافة اختصار للوحة المفاتيح للحفظ
    noteInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            saveButton.click();
        }
    });

    // تصفية الملاحظات
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentFilter = button.id.replace('Notes', '');
            loadNotes();
        });
    });

    // تصدير الملاحظات
    exportButton.addEventListener('click', exportNotes);

    // حذف كل الملاحظات
    clearAllButton.addEventListener('click', () => {
        if (confirm('هل أنت متأكد من حذف جميع الملاحظات؟')) {
            chrome.storage.sync.get(['notes', 'deletedNotes'], (result) => {
                const notes = result.notes || [];
                const deletedNotes = result.deletedNotes || [];
                
                // إضافة تاريخ الحذف لجميع الملاحظات
                const newDeletedNotes = notes.map(note => ({
                    ...note,
                    deletedAt: Date.now()
                }));
                
                // دمج الملاحظات المحذوفة مع القديمة
                const allDeletedNotes = [...deletedNotes, ...newDeletedNotes];
                
                // حذف الملاحظات القديمة (أكثر من 7 أيام)
                const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                const filteredDeletedNotes = allDeletedNotes.filter(note => 
                    note.deletedAt > sevenDaysAgo
                );

                chrome.storage.sync.set({ 
                    notes: [],
                    deletedNotes: filteredDeletedNotes
                }, () => {
                    loadNotes();
                    showToast('تم نقل جميع الملاحظات إلى سلة المحذوفات', 'success');
                });
            });
        }
    });

    function loadNotes() {
        const storage = navigator.onLine ? chrome.storage.sync : chrome.storage.local;
        
        storage.get(['notes'], (result) => {
            let notes = result.notes || [];
            
            if (searchTerm) {
                notes = notes.filter(note => 
                    note.text.toLowerCase().includes(searchTerm) ||
                    note.category.toLowerCase().includes(searchTerm)
                );
            }

            if (currentFilter !== 'all') {
                notes = notes.filter(note => note.category === currentFilter);
            }

            // إضافة مؤشر للملاحظات غير المتزامنة
            notes = notes.map(note => ({
                ...note,
                syncStatus: note.synced ? 'synced' : 'pending'
            }));

            displayNotes(notes);
        });
    }

    function saveNote(text, category) {
        const storage = navigator.onLine ? chrome.storage.sync : chrome.storage.local;
        
        storage.get(['notes'], (result) => {
            const notes = result.notes || [];
            const now = new Date();
            
            const newNote = {
                text: text,
                category,
                date: now.toLocaleString('ar'),
                id: Date.now(),
                pinned: false,
                synced: navigator.onLine
            };

            const pinnedNotes = notes.filter(note => note.pinned);
            const unpinnedNotes = notes.filter(note => !note.pinned);
            unpinnedNotes.unshift(newNote);
            const sortedNotes = [...pinnedNotes, ...unpinnedNotes];

            storage.set({ notes: sortedNotes }, () => {
                displayNotes(sortedNotes);
                if (!navigator.onLine) {
                    showToast('تم الحفظ محلياً، ستتم المزامنة عند توفر الاتصال', 'info');
                } else {
                    showToast('تم حفظ الملاحظة بنجاح', 'success');
                }
            });
        });
    }

    function createNoteElement(note, index) {
        const div = document.createElement('div');
        div.className = `note-item ${note.pinned ? 'pinned' : ''}`;
        
        const formattedText = note.text.replace(/\n\s*\n/g, '<br><br>');
        
        div.innerHTML = `
            <button class="pin-btn ${note.pinned ? 'pinned' : ''}" title="${note.pinned ? 'إلغاء التثبيت' : 'تثبيت'}" data-id="${note.id}">
                <i class="fas fa-thumbtack"></i>
            </button>
            <div class="note-category">
                ${getCategoryIcon(note.category)} ${note.category}
            </div>
            <div class="note-text">
                ${formattedText}
            </div>
            <div class="note-date">
                <i class="far fa-clock"></i> ${note.date}
            </div>
            <div class="note-actions">
                <button class="btn secondary-btn copy-btn" title="نسخ" data-id="${note.id}">
                    <i class="fas fa-copy"></i> نسخ
                </button>
                <button class="btn edit-btn" title="تعديل" data-id="${note.id}">
                    <i class="fas fa-edit"></i> تعديل
                </button>
                <button class="btn danger-btn delete-btn" title="حذف" data-id="${note.id}">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </div>
        `;

        // معالجة النقر على الكارت
        const noteText = div.querySelector('.note-text');
        noteText.addEventListener('click', (e) => {
            e.stopPropagation();
            noteText.classList.toggle('expanded');
        });

        // معالجة زر التثبيت
        const pinBtn = div.querySelector('.pin-btn');
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePin(note.id);
        });

        // معالجة زر النسخ
        const copyBtn = div.querySelector('.copy-btn');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(note.text).then(() => {
                showToast('تم نسخ النص بنجاح', 'success');
            });
        });

        // معالجة زر التعديل
        const editBtn = div.querySelector('.edit-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const editModal = document.getElementById('editModal');
            const editNoteText = document.getElementById('editNoteText');
            const editNoteCategory = document.getElementById('editNoteCategory');
            const saveEdit = document.getElementById('saveEdit');
            const cancelEdit = document.getElementById('cancelEdit');

            editNoteText.value = note.text;
            editNoteCategory.value = note.category;
            editModal.classList.add('show');

            const saveEditHandler = () => {
                const updatedText = editNoteText.value.trim();
                if (updatedText) {
                    chrome.storage.sync.get(['notes'], (result) => {
                        const notes = result.notes || [];
                        const noteIndex = notes.findIndex(n => n.id === note.id);
                        if (noteIndex !== -1) {
                            notes[noteIndex].text = updatedText;
                            notes[noteIndex].category = editNoteCategory.value;
                            chrome.storage.sync.set({ notes }, () => {
                                loadNotes();
                                editModal.classList.remove('show');
                                showToast('تم تحديث الملاحظة بنجاح', 'success');
                            });
                        }
                    });
                }
                saveEdit.removeEventListener('click', saveEditHandler);
            };

            saveEdit.addEventListener('click', saveEditHandler);
            cancelEdit.addEventListener('click', () => {
                editModal.classList.remove('show');
                saveEdit.removeEventListener('click', saveEditHandler);
            });
        });

        // معالجة زر الحذف
        const deleteBtn = div.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('هل أنت متأكد من حذف هذه الملاحظة؟')) {
                chrome.storage.sync.get(['notes', 'deletedNotes'], (result) => {
                    const notes = result.notes || [];
                    const deletedNotes = result.deletedNotes || [];
                    const noteIndex = notes.findIndex(n => n.id === note.id);
                    
                    if (noteIndex !== -1) {
                        // إضافة الملاحظة إلى سلة المحذوفات مع تاريخ الحذف
                        const deletedNote = {
                            ...notes[noteIndex],
                            deletedAt: Date.now()
                        };
                        deletedNotes.push(deletedNote);
                        
                        // حذف الملاحظة من القائمة الرئيسية
                        notes.splice(noteIndex, 1);
                        
                        chrome.storage.sync.set({ 
                            notes: notes,
                            deletedNotes: deletedNotes
                        }, () => {
                            loadNotes();
                            showToast('تم نقل الملاحظة إلى سلة المحذوفات', 'success');
                        });
                    }
                });
            }
        });

        return div;
    }

    function deleteNote(noteId) {
        chrome.storage.sync.get(['notes', 'deletedNotes'], (result) => {
            const notes = result.notes || [];
            const deletedNotes = result.deletedNotes || [];
            
            // البحث عن الملاحظة المراد حذفها
            const noteIndex = notes.findIndex(note => note.id === noteId);
            
            if (noteIndex !== -1) {
                // إضافة تاريخ الحذف للملحظة
                const deletedNote = {
                    ...notes[noteIndex],
                    deletedAt: Date.now()
                };
                
                // إضافة الملاحظة إلى سلة المحذوفات
                deletedNotes.push(deletedNote);
                
                // حذف الملاحظة من القائمة الرئيسية
                notes.splice(noteIndex, 1);
                
                // حذف الملاحظات القديمة (أكثر من 7 أيام)
                const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                const filteredDeletedNotes = deletedNotes.filter(note => 
                    note.deletedAt > sevenDaysAgo
                );

                // حفظ التغييرات
                chrome.storage.sync.set({ 
                    notes: notes,
                    deletedNotes: filteredDeletedNotes
                }, () => {
                    loadNotes();
                    showToast('تم نقل الملاحظة إلى سلة المحذوفات', 'success');
                });
            }
        });
    }

    function restoreNote(noteId) {
        chrome.storage.sync.get(['notes', 'deletedNotes'], (result) => {
            const notes = result.notes || [];
            const deletedNotes = result.deletedNotes || [];
            
            // البحث عن الملاحظة المراد استعادتها
            const noteIndex = deletedNotes.findIndex(note => note.id === noteId);
            
            if (noteIndex !== -1) {
                // استعادة الملاحظة بدون تريخ الحذف
                const { deletedAt, ...restoredNote } = deletedNotes[noteIndex];
                
                // إضافة الملاحظة إلى القائمة الرئيسية
                notes.unshift(restoredNote);
                
                // حذف الملاحظة من سلة المحذوفات
                deletedNotes.splice(noteIndex, 1);
                
                // حفظ التغييرات
                chrome.storage.sync.set({ 
                    notes: notes,
                    deletedNotes: deletedNotes
                }, () => {
                    loadNotes();
                    showToast('تم استعادة الملاحظة بنجاح', 'success');
                });
            }
        });
    }

    function displayNotes(notes) {
        notesList.innerHTML = notes.length ? '' : '<div class="no-notes">لا توجد ملاحظات</div>';
        notes.forEach((note, index) => {
            const noteElement = createNoteElement(note, index);
            notesList.appendChild(noteElement);
        });
    }

    function exportNotes() {
        chrome.storage.sync.get(['notes'], (result) => {
            const notes = result.notes || [];
            const exportData = notes.map(note => ({
                text: note.text,
                category: note.category,
                date: note.date
            }));
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `snapnote-export-${new Date().toLocaleDateString()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('تم تصدير الملاحظات بنجاح', 'success');
        });
    }

    function showToast(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('toast');
        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            warning: '⚠️'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close">×</button>
        `;
        
        toast.className = `toast show toast-${type}`;
        
        // إضافة زر إغلاق للتنبيه
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.onclick = () => toast.classList.remove('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }

    function getCategoryIcon(category) {
        const icons = {
            'general': '<i class="fas fa-inbox"></i>',
            'work': '<i class="fas fa-briefcase"></i>',
            'personal': '<i class="fas fa-user"></i>',
            'ideas': '<i class="fas fa-lightbulb"></i>'
        };
        return icons[category] || icons['general'];
    }

    // إضافة الدوال الجديدة للتعديل
    let currentEditingNote = null;
    const editModal = document.getElementById('editModal');
    const editNoteText = document.getElementById('editNoteText');
    const editNoteCategory = document.getElementById('editNoteCategory');
    const saveEditBtn = document.getElementById('saveEdit');
    const cancelEditBtn = document.getElementById('cancelEdit');

    function openEditModal(note) {
        currentEditingNote = note;
        editNoteText.value = note.text;
        editNoteCategory.value = note.category;
        editModal.classList.add('show');
    }

    function closeEditModal() {
        editModal.classList.remove('show');
        currentEditingNote = null;
        editNoteText.value = '';
    }

    saveEditBtn.addEventListener('click', () => {
        if (currentEditingNote) {
            const newText = editNoteText.value.trim();
            const newCategory = editNoteCategory.value;
            
            if (newText) {
                chrome.storage.sync.get(['notes'], (result) => {
                    const notes = result.notes || [];
                    const noteIndex = notes.findIndex(n => n.id === currentEditingNote.id);
                    
                    if (noteIndex !== -1) {
                        notes[noteIndex] = {
                            ...notes[noteIndex],
                            text: newText,
                            category: newCategory,
                            lastEdited: new Date().toLocaleString('ar-SA')
                        };
                        
                        chrome.storage.sync.set({ notes }, () => {
                            loadNotes();
                            closeEditModal();
                            showToast('<i class="fas fa-check"></i> تم تحديث الملاحظة', 'success');
                        });
                    }
                });
            }
        }
    });

    cancelEditBtn.addEventListener('click', closeEditModal);

    // Theme Toggle
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;

    // تعديل تحميل الثيم
    chrome.storage.sync.get(['darkMode'], (result) => {
        // جعل الوضع الليلي هو الافتراضي إذا لم يتم تعيين قيمة
        const isDarkMode = result.darkMode === undefined ? true : result.darkMode;
        if (isDarkMode) {
            body.classList.add('dark-mode');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            body.classList.remove('dark-mode');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
        // حفظ الإعداد الافتراضي
        if (result.darkMode === undefined) {
            chrome.storage.sync.set({ darkMode: true });
        }
    });

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        const isDarkMode = body.classList.contains('dark-mode');
        chrome.storage.sync.set({ darkMode: isDarkMode });
        themeToggle.innerHTML = isDarkMode ? 
            '<i class="fas fa-sun"></i>' : 
            '<i class="fas fa-moon"></i>';
    });

    // إضافة متغيرات الإعدادات
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettings = document.getElementById('closeSettings');
    const categoryList = document.getElementById('categoryList');
    const newCategoryInput = document.getElementById('newCategoryInput');
    const addCategoryBtn = document.getElementById('addCategory');

    // تحميل التصنيفات المخصصة
    function loadCategories() {
        chrome.storage.sync.get(['categories'], (result) => {
            const categories = result.categories || defaultCategories;
            updateCategoryList(categories);
            updateNoteCategories(categories); // تحديث قوائم التصنيف في النماذج
        });
    }

    // تعريف التصنيفات الافتراضية
    const defaultCategories = [
        { id: 'general', name: 'عام', icon: '📝', isDefault: true },
        { id: 'work', name: 'عمل', icon: '💼', isDefault: true },
        { id: 'personal', name: 'شخصي', icon: '👤', isDefault: true },
        { id: 'ideas', name: 'أفكار', icon: '💡', isDefault: true }
    ];

    // تحديث قائمة التصنيفات مع إضافة خيار التعديل
    function updateCategoryList(categories) {
        categoryList.innerHTML = categories.map(cat => `
            <div class="category-item">
                <span>${cat.icon} ${cat.name}</span>
                <div class="category-actions">
                    <button class="edit-category-btn" data-id="${cat.id}" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${cat.id !== 'general' ? `
                        <button class="delete-category" data-id="${cat.id}" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');

        // إافة مستمعي الأحداث لأزرار التعديل
        document.querySelectorAll('.edit-category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const categoryId = e.target.closest('.edit-category-btn').dataset.id;
                const category = categories.find(cat => cat.id === categoryId);
                if (category) {
                    const newName = prompt('أدخل الام الجديد للتصنيف:', category.name);
                    if (newName && newName.trim()) {
                        chrome.storage.sync.get(['categories'], (result) => {
                            const updatedCategories = result.categories.map(cat => 
                                cat.id === categoryId ? { ...cat, name: newName.trim() } : cat
                            );
                            chrome.storage.sync.set({ categories: updatedCategories }, () => {
                                loadCategories();
                                showToast('تم تعديل التصنيف بنجاح', 'success');
                            });
                        });
                    }
                }
            });
        });
    }

    // تحديث select boxes
    function updateCategorySelects(categories) {
        const selects = [categorySelect, editNoteCategory];
        selects.forEach(select => {
            if (select) {
                const currentValue = select.value;
                select.innerHTML = categories.map(cat => 
                    `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`
                ).join('');
                select.value = currentValue;
            }
        });

        // تحديث أزرار التصفية
        updateFilterButtons(categories);
    }

    // تحديث أزرار التصفية
    function updateFilterButtons(categories) {
        const filtersContainer = document.querySelector('.filters');
        filtersContainer.innerHTML = `
            <button id="allNotes" class="filter-btn ${currentFilter === 'all' ? 'active' : ''}">
                <i class="fas fa-layer-group"></i> الكل
            </button>
            ${categories.map(cat => `
                <button id="${cat.id}Notes" class="filter-btn ${currentFilter === cat.id ? 'active' : ''}">
                    ${cat.icon} ${cat.name}
                </button>
            `).join('')}
        `;

        // إعادة تعيين مستمعي الأحداث لأزرار التصفية
        const newFilterButtons = document.querySelectorAll('.filter-btn');
        newFilterButtons.forEach(button => {
            button.addEventListener('click', () => {
                newFilterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                currentFilter = button.id.replace('Notes', '');
                loadNotes();
            });
        });
    }

    // إضافة تصنيف جديد
    addCategoryBtn.addEventListener('click', () => {
        const name = newCategoryInput.value.trim();
        if (name) {
            chrome.storage.sync.get(['categories'], (result) => {
                const categories = result.categories || defaultCategories;
                const newCategory = {
                    id: Date.now().toString(),
                    name,
                    icon: '📌',
                    isDefault: false
                };
                categories.push(newCategory);
                chrome.storage.sync.set({ categories }, () => {
                    loadCategories();
                    newCategoryInput.value = '';
                    showToast('تم إضافة التصنيف بنجاح', 'success');
                });
            });
        }
    });

    // حذف تصنيف
    categoryList.addEventListener('click', (e) => {
        if (e.target.closest('.delete-category')) {
            const categoryId = e.target.closest('.delete-category').dataset.id;
            if (categoryId === 'general') {
                showToast('لا يمكن حذف التصنيف العام', 'error');
                return;
            }
            if (confirm('هل أنت متأكد من حذف هذا التصيف؟ سيتم نقل جميع الملاحظات المرتبطة به إلى التصنيف العام.')) {
                chrome.storage.sync.get(['categories', 'notes'], (result) => {
                    const categories = result.categories.filter(cat => cat.id !== categoryId);
                    const notes = result.notes.map(note => {
                        if (note.category === categoryId) {
                            return { ...note, category: 'general' };
                        }
                        return note;
                    });
                    chrome.storage.sync.set({ categories, notes }, () => {
                        loadCategories();
                        loadNotes();
                        showToast('تم حذف التصنيف بنجاح', 'success');
                    });
                });
            }
        }
    });

    // فتح وإغلاق مودال الإعدادات
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('show');
        loadCategories();
    });

    closeSettings.addEventListener('click', () => {
        settingsModal.classList.remove('show');
    });

    function togglePin(noteId) {
        chrome.storage.sync.get(['notes'], (result) => {
            const notes = result.notes || [];
            const noteIndex = notes.findIndex(note => note.id === noteId);
            
            if (noteIndex !== -1) {
                notes[noteIndex].pinned = !notes[noteIndex].pinned;
                
                // إعادة ترتيب النوتس (المثبة في الأعى)
                const pinnedNotes = notes.filter(note => note.pinned);
                const unpinnedNotes = notes.filter(note => !note.pinned);
                const sortedNotes = [...pinnedNotes, ...unpinnedNotes];

                chrome.storage.sync.set({ notes: sortedNotes }, () => {
                    loadNotes();
                    showToast(notes[noteIndex].pinned ? 'تم تثبيت الملاحظة' : 'تم إلغاء تثبيت الملاحظة', 'success');
                });
            }
        });
    }

    // إضافة معالج حدث لزر سلة المحذوفات
    const trashBtn = document.getElementById('trashBtn');
    const trashModal = document.getElementById('trashModal');
    const closeTrash = document.getElementById('closeTrash');
    const deletedNotesList = document.getElementById('deletedNotesList');

    trashBtn.addEventListener('click', () => {
        trashModal.classList.add('show');
        loadDeletedNotes();
    });

    closeTrash.addEventListener('click', () => {
        trashModal.classList.remove('show');
    });

    function loadDeletedNotes() {
        chrome.storage.sync.get(['deletedNotes'], (result) => {
            const deletedNotes = result.deletedNotes || [];
            displayDeletedNotes(deletedNotes);
        });
    }

    function displayDeletedNotes(notes) {
        deletedNotesList.innerHTML = '';
        
        if (notes.length === 0) {
            deletedNotesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-trash-alt"></i>
                    <p>لا توجد ملاحظات محذوفة</p>
                </div>`;
            return;
        }

        notes.sort((a, b) => b.deletedAt - a.deletedAt); // ترتيب حسب تاريخ الحذف

        notes.forEach((note) => {
            const div = document.createElement('div');
            div.className = 'note-item deleted-note';
            
            const deletedDate = new Date(note.deletedAt).toLocaleString('ar', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const daysLeft = Math.ceil((note.deletedAt + (7 * 24 * 60 * 60 * 1000) - Date.now()) / (1000 * 60 * 60 * 24));
            
            div.innerHTML = `
                <div class="deleted-note-header">
                    <span class="deleted-date">
                        <i class="fas fa-clock"></i>
                        تم الحذف: ${deletedDate}
                    </span>
                    <span class="days-left ${daysLeft <= 2 ? 'warning' : ''}">
                        <i class="fas fa-hourglass-half"></i>
                        متبقي ${daysLeft} يوم
                    </span>
                </div>
                <div class="note-category">
                    ${getCategoryIcon(note.category)} ${note.category}
                </div>
                <div class="note-text">
                    ${note.text}
                </div>
                <div class="note-actions">
                    <button class="restore-btn" title="استعادة" data-id="${note.id}">
                        <i class="fas fa-undo"></i> استعادة
                    </button>
                    <button class="permanent-delete-btn" title="حذف نهائي" data-id="${note.id}">
                        <i class="fas fa-trash"></i> حذف نهائي
                    </button>
                </div>
            `;

            // إضافة معالج حدث لزر الاستعادة
            div.querySelector('.restore-btn').addEventListener('click', () => {
                restoreNote(note.id);
            });

            // إضافة معالج حدث للحذف النهائي
            div.querySelector('.permanent-delete-btn').addEventListener('click', () => {
                if (confirm('هل أنت متأكد من الحذف النهائي للملاحظة؟')) {
                    permanentlyDeleteNote(note.id);
                }
            });

            deletedNotesList.appendChild(div);
        });
    }

    // إضافة دالة الحذف النهائي
    function permanentlyDeleteNote(noteId) {
        chrome.storage.sync.get(['deletedNotes'], (result) => {
            const deletedNotes = result.deletedNotes || [];
            const updatedNotes = deletedNotes.filter(note => note.id !== noteId);
            
            chrome.storage.sync.set({ deletedNotes: updatedNotes }, () => {
                loadDeletedNotes();
                showToast('تم حذف الملاحظة نهائياً', 'success');
            });
        });
    }

    // تحدي�� دالة تحميل التصنيفات وإضافة تصنيف جديد
    function loadCategories() {
        chrome.storage.sync.get(['categories'], (result) => {
            const categories = result.categories || defaultCategories;
            updateCategoryList(categories);
            updateNoteCategories(categories); // تحديث قوائم التصنيف في النماذج
        });
    }

    function updateNoteCategories(categories) {
        // تحديث قائمة التصنيفات في نموذج إضافة ملاحظة جديدة
        const noteCategory = document.getElementById('noteCategory');
        const editNoteCategory = document.getElementById('editNoteCategory');
        
        // حفظ القيمة المحددة حالياً
        const currentValue = noteCategory.value;
        const currentEditValue = editNoteCategory.value;
        
        // تفريغ القوائم
        noteCategory.innerHTML = '';
        editNoteCategory.innerHTML = '';
        
        // إضافة التصنيفات
        categories.forEach(category => {
            const icon = getCategoryIcon(category.id);
            const optionHTML = `${icon} ${category.name}`;
            
            // إضافة للقائمة الرئيسية
            const option = new Option(optionHTML, category.id);
            option.innerHTML = optionHTML; // ضروري لعرض الأيقونة
            noteCategory.appendChild(option);
            
            // إضافة لقائمة التعديل
            const editOption = new Option(optionHTML, category.id);
            editOption.innerHTML = optionHTML;
            editNoteCategory.appendChild(editOption);
        });
        
        // استعادة القيم المحددة
        noteCategory.value = currentValue;
        editNoteCategory.value = currentEditValue;
    }

    // إضافة معالج حدث لزر About
    const aboutBtn = document.getElementById('aboutBtn');
    const aboutModal = document.getElementById('aboutModal');
    const closeAbout = document.getElementById('closeAbout');

    aboutBtn.addEventListener('click', () => {
        aboutModal.classList.add('show');
    });

    closeAbout.addEventListener('click', () => {
        aboutModal.classList.remove('show');
    });

    // إضافة معالج لفتح الروابط في المتصفح
    document.querySelectorAll('.social-links a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: link.href });
        });
    });

    // إضافة معالجة الاخت��ارات داخل النافذة المنبثقة
    document.addEventListener('keydown', (e) => {
        // حفظ الملاحظة: Ctrl/Command + Enter
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('saveNote').click();
        }
        
        // البحث: Ctrl/Command + F
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
        }
        
        // تغيير السمة: Ctrl/Command + D
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            document.getElementById('themeToggle').click();
        }
        
        // فتح الإعدادات: Ctrl/Command + ,
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            document.getElementById('settingsBtn').click();
        }
    });

    // التأكد من عمل الإضافة على متصفح Brave
    if (navigator.brave) {
        // إضافة تهيئة خاصة لمتصفح Brave إذا لزم الأمر
        console.log('Running on Brave browser');
    }

    // إضافة معالج حدث لزر التحديث
    document.getElementById('updateBtn').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://github.com/Omar-Tnzxo/PopNote-Extension' });
    });

    // إضافة دعم الروابط والتنبيهات المحسنة
    function formatNoteText(text) {
        // تحويل الروابط إلى عناصر قابلة للنقر
        return text.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank" class="note-link">$1</a>'
        );
    }

    // إضافة دليل المستخدم التفاعلي
    function showTutorial() {
        chrome.storage.local.get('tutorialShown', (result) => {
            if (!result.tutorialShown) {
                const steps = [
                    {
                        element: '#noteInput',
                        title: 'إضافة ملاحظة',
                        content: 'اكتب ملاحظتك هنا'
                    },
                    // ... المزيد من الخطوات
                ];

                startTutorial(steps);
                chrome.storage.local.set({ tutorialShown: true });
            }
        });
    }
}); 