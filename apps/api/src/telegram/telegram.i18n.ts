import { Lang } from '@prisma/client';

type Dict = Record<string, string>;

export const TG: Record<Lang, Dict> = {
  UZ: {
    choose_lang: 'Tilni tanlang / Выберите язык / Choose language',
    lang_set: '✅ Til tanlandi: O‘zbekcha',
    ask_phone:
      'Sizni administrator tizimga ro‘yxatdan o‘tkazgan bo‘lsa, iltimos pastdagi tugma orqali telefon raqamingizni yuboring.\n\n' +
      '⚠️ *Diqqat!*\n' +
      '• Telefon raqamingizni qo‘lda yozmang.\n' +
      '• Copy/Paste qilmang.\n' +
      '• Forward qilingan contact yubormang.\n' +
      '• Boshqa odamning raqamini yubormang.\n\n' +
      'Faqat pastdagi tugma orqali *o‘z* raqamingizni yuboring.',
    btn_phone: '📱 Telefon raqamimni yuborish',
    err_manual:
      '❌ Telefon raqamini qo‘lda yozish yoki nusxalash mumkin emas.\n\nIltimos, pastdagi «📱 Telefon raqamimni yuborish» tugmasidan foydalaning.',
    err_forwarded: '❌ Forward qilingan contact qabul qilinmaydi. Iltimos, tugma orqali o‘z raqamingizni yuboring.',
    err_other: 'Bu raqam ushbu Telegram akkauntiga tegishli emas.\nIltimos, o‘z telefon raqamingizni yuboring.',
    err_not_found:
      'Sizning telefon raqamingiz tizimdan topilmadi.\n\nIltimos, administratoringiz bilan bog‘laning.',
    err_blocked: 'Sizning hisobingiz bloklangan. Administrator bilan bog‘laning.',
    err_taken: 'Bu telefon raqami boshqa Telegram akkauntga biriktirilgan. Administrator bilan bog‘laning.',
    welcome: '✅ Xush kelibsiz, *{name}*!\n\nBo‘lim: {dept}\nLavozim: {position}',
    open_miniapp: '🚀 Mini App‘ni ochish',
    menu: 'Kerakli bo‘limni tanlang:',
    menu_tasks: '📋 Mening ishlarim',
    menu_report: '➕ Ish natijasini kiritish',
    menu_plan: '📊 Mening planim',
    menu_profile: '👤 Profil',
    menu_lang: '🌐 Til',
    no_tasks: 'Bugun uchun vazifa yo‘q.',
    tasks_title: '📋 *Bugungi ishlaringiz*',
    choose_order: 'Qaysi zakaz bo‘yicha ish bajardingiz?',
    no_orders: 'Sizning bo‘limingiz uchun faol zakaz topilmadi.',
    ask_qty: 'Zakaz: *{order}*\nBosqich: *{stage}*\n\nNecha dona bajarildi? Raqam kiriting:',
    ask_defect: 'Brak (nuqsonli) dona soni? Bo‘lmasa 0 yuboring:',
    saved: '✅ Saqlandi!\n\nZakaz: *{order}*\nBosqich: *{stage}*\n+{qty} dona{defect}\n\nJami: {done} / {plan} ({progress}%)',
    invalid_number: '❌ Faqat raqam kiriting.',
    cancel: '↩️ Bekor qilish',
    cancelled: 'Bekor qilindi.',
    plan_title: '📊 *Sizning planingiz*',
    plan_body: 'Bugun: {d_done} / {d_total}\nHafta: {w_done} / {w_total}\nOy: {m_done} / {m_total}\n\nProgress: {progress}%',
    profile: '👤 *{name}*\nBo‘lim: {dept}\nLavozim: {position}\nRole: {role}\nTelefon: {phone}',
    no_stage: 'Sizning bo‘limingizga ishlab chiqarish bosqichi biriktirilmagan. Administrator bilan bog‘laning.',
    error: '⚠️ Xatolik: {msg}',
  },
  RU: {
    choose_lang: 'Tilni tanlang / Выберите язык / Choose language',
    lang_set: '✅ Язык выбран: Русский',
    ask_phone:
      'Если администратор зарегистрировал вас в системе, отправьте свой номер телефона кнопкой ниже.\n\n' +
      '⚠️ *Внимание!*\n' +
      '• Не вводите номер вручную.\n' +
      '• Не копируйте/вставляйте.\n' +
      '• Не отправляйте пересланный контакт.\n' +
      '• Не отправляйте чужой номер.\n\n' +
      'Отправьте *свой* номер только кнопкой ниже.',
    btn_phone: '📱 Отправить мой номер',
    err_manual: '❌ Вводить номер вручную или копировать нельзя.\n\nИспользуйте кнопку «📱 Отправить мой номер».',
    err_forwarded: '❌ Пересланный контакт не принимается. Отправьте свой номер кнопкой.',
    err_other: 'Этот номер не принадлежит данному Telegram-аккаунту.\nПожалуйста, отправьте свой номер телефона.',
    err_not_found: 'Ваш номер телефона не найден в системе.\n\nОбратитесь к вашему администратору.',
    err_blocked: 'Ваша учётная запись заблокирована. Обратитесь к администратору.',
    err_taken: 'Этот номер уже привязан к другому Telegram-аккаунту. Обратитесь к администратору.',
    welcome: '✅ Добро пожаловать, *{name}*!\n\nОтдел: {dept}\nДолжность: {position}',
    open_miniapp: '🚀 Открыть Mini App',
    menu: 'Выберите раздел:',
    menu_tasks: '📋 Мои задачи',
    menu_report: '➕ Внести результат',
    menu_plan: '📊 Мой план',
    menu_profile: '👤 Профиль',
    menu_lang: '🌐 Язык',
    no_tasks: 'На сегодня задач нет.',
    tasks_title: '📋 *Ваши задачи на сегодня*',
    choose_order: 'По какому заказу выполнена работа?',
    no_orders: 'Активных заказов для вашего отдела не найдено.',
    ask_qty: 'Заказ: *{order}*\nЭтап: *{stage}*\n\nСколько единиц выполнено? Введите число:',
    ask_defect: 'Количество брака? Если нет — отправьте 0:',
    saved: '✅ Сохранено!\n\nЗаказ: *{order}*\nЭтап: *{stage}*\n+{qty} шт{defect}\n\nИтого: {done} / {plan} ({progress}%)',
    invalid_number: '❌ Введите только число.',
    cancel: '↩️ Отмена',
    cancelled: 'Отменено.',
    plan_title: '📊 *Ваш план*',
    plan_body: 'Сегодня: {d_done} / {d_total}\nНеделя: {w_done} / {w_total}\nМесяц: {m_done} / {m_total}\n\nПрогресс: {progress}%',
    profile: '👤 *{name}*\nОтдел: {dept}\nДолжность: {position}\nРоль: {role}\nТелефон: {phone}',
    no_stage: 'К вашему отделу не привязан этап производства. Обратитесь к администратору.',
    error: '⚠️ Ошибка: {msg}',
  },
  EN: {
    choose_lang: 'Tilni tanlang / Выберите язык / Choose language',
    lang_set: '✅ Language set: English',
    ask_phone:
      'If an administrator registered you in the system, please send your phone number using the button below.\n\n' +
      '⚠️ *Important!*\n' +
      '• Do not type your number manually.\n' +
      '• Do not copy/paste it.\n' +
      '• Do not send a forwarded contact.\n' +
      '• Do not send someone else’s number.\n\n' +
      'Send *your own* number using the button below only.',
    btn_phone: '📱 Send my phone number',
    err_manual: '❌ Typing or pasting the number is not allowed.\n\nPlease use the “📱 Send my phone number” button.',
    err_forwarded: '❌ Forwarded contacts are not accepted. Please share your own number via the button.',
    err_other: 'This number does not belong to this Telegram account.\nPlease send your own phone number.',
    err_not_found: 'Your phone number was not found in the system.\n\nPlease contact your administrator.',
    err_blocked: 'Your account is blocked. Please contact your administrator.',
    err_taken: 'This phone number is already linked to another Telegram account. Contact your administrator.',
    welcome: '✅ Welcome, *{name}*!\n\nDepartment: {dept}\nPosition: {position}',
    open_miniapp: '🚀 Open Mini App',
    menu: 'Choose a section:',
    menu_tasks: '📋 My tasks',
    menu_report: '➕ Report output',
    menu_plan: '📊 My plan',
    menu_profile: '👤 Profile',
    menu_lang: '🌐 Language',
    no_tasks: 'No tasks for today.',
    tasks_title: '📋 *Your tasks for today*',
    choose_order: 'Which order did you work on?',
    no_orders: 'No active orders found for your department.',
    ask_qty: 'Order: *{order}*\nStage: *{stage}*\n\nHow many pieces completed? Enter a number:',
    ask_defect: 'Defect count? Send 0 if none:',
    saved: '✅ Saved!\n\nOrder: *{order}*\nStage: *{stage}*\n+{qty} pcs{defect}\n\nTotal: {done} / {plan} ({progress}%)',
    invalid_number: '❌ Please enter a number only.',
    cancel: '↩️ Cancel',
    cancelled: 'Cancelled.',
    plan_title: '📊 *Your plan*',
    plan_body: 'Today: {d_done} / {d_total}\nWeek: {w_done} / {w_total}\nMonth: {m_done} / {m_total}\n\nProgress: {progress}%',
    profile: '👤 *{name}*\nDepartment: {dept}\nPosition: {position}\nRole: {role}\nPhone: {phone}',
    no_stage: 'No production stage is linked to your department. Please contact your administrator.',
    error: '⚠️ Error: {msg}',
  },
};

export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  let s = TG[lang]?.[key] ?? TG.UZ[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
