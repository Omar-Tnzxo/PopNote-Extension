// تخزين مؤقت للبيانات
let cachedData = {
  notes: [],
  categories: [],
  pendingChanges: []
};

// تهيئة التخزين المحلي
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['notes', 'categories'], (result) => {
    if (!result.notes) {
      chrome.storage.local.set({ notes: [] });
    }
    if (!result.categories) {
      chrome.storage.local.set({ 
        categories: [
          { id: 'general', name: 'عام' },
          { id: 'work', name: 'عمل' },
          { id: 'personal', name: 'شخصي' },
          { id: 'ideas', name: 'أفكار' }
        ] 
      });
    }
  });
});

// مراقبة حالة الاتصال
chrome.runtime.onStartup.addListener(() => {
  syncData();
});

// مزامنة البيانات عند توفر الاتصال
function syncData() {
  if (navigator.onLine) {
    chrome.storage.local.get(['pendingChanges'], (result) => {
      const pendingChanges = result.pendingChanges || [];
      
      if (pendingChanges.length > 0) {
        // تطبيق التغييرات المعلقة على التخزين المتزامن
        pendingChanges.forEach(change => {
          chrome.storage.sync.set(change, () => {
            console.log('تمت مزامنة التغييرات');
          });
        });
        
        // مسح التغييرات المعلقة بعد المزامنة
        chrome.storage.local.set({ pendingChanges: [] });
      }
    });
  }
}

// معالجة التغييرات في حالة الاتصال
window.addEventListener('online', () => {
  syncData();
});

// الاحتفاظ بالتغييرات محلياً عند عدم وجود اتصال
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    // تحديث الذاكرة المؤقتة
    Object.keys(changes).forEach(key => {
      cachedData[key] = changes[key].newValue;
    });
    
    // حفظ التغييرات للمزامنة اللاحقة
    if (!navigator.onLine && key !== 'pendingChanges') {
      const change = {};
      change[key] = changes[key].newValue;
      
      chrome.storage.local.get(['pendingChanges'], (result) => {
        const pendingChanges = result.pendingChanges || [];
        pendingChanges.push(change);
        chrome.storage.local.set({ pendingChanges });
      });
    }
  }
});

// معالجة الاختصارات
chrome.commands.onCommand.addListener((command) => {
  if (command === "_execute_action") {
    chrome.action.openPopup();
  }
});

// تحسين الأداء عند فتح النافذة
chrome.action.onClicked.addListener(() => {
  chrome.action.openPopup();
}); 