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

  // جدولة النسخ الاحتياطي التلقائي
  chrome.alarms.create('autoBackup', {
    periodInMinutes: 60 // نسخ احتياطي كل ساعة
  });
});

// مراقبة حالة الاتصال
chrome.runtime.onStartup.addListener(() => {
  syncData();
});

// مزامنة لبيانات عند توفر الاتصال
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

// معالج النسخ الاحتياطي
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoBackup') {
    createBackup();
  }
});

async function createBackup() {
  try {
    const data = await chrome.storage.sync.get(null);
    const backup = {
      timestamp: Date.now(),
      data: data
    };
    
    // حفظ النسخة الاحتياطية
    await chrome.storage.local.set({
      [`backup_${backup.timestamp}`]: backup
    });

    // حذف النسخ القديمة (الاحتفاظ بآخر 5 نسخ)
    const backups = await getBackups();
    if (backups.length > 5) {
      const oldBackups = backups.slice(5);
      for (const backup of oldBackups) {
        await chrome.storage.local.remove(`backup_${backup.timestamp}`);
      }
    }
  } catch (error) {
    console.error('خطأ في النسخ الاحتياطي:', error);
  }
} 