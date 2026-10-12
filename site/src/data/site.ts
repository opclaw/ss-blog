// Единый источник данных сайта. Меняете телефон/почту/меню — меняется на всех страницах.

export const SITE = {
  name: 'Smart Solutions',
  url: 'https://smartsolutions.today',
  themeColor: '#08080D',
  ogImage: 'https://smartsolutions.today/images/og-cover.jpg',
  footerDesc: 'Системы привлечения клиентов<br>на основе исследований',
  since: 2017,
  // Яндекс.Метрика стоит на всех страницах текущего сайта. false — отключить везде.
  metrikaId: 106747750 as number | null,
};

// Автор материалов блога — одна точка правды: имя, роль, описание.
// Используется в карточке автора, в строке меты статьи и в разметке Person.
export const AUTHOR = {
  name: 'Олег Кречетов',
  jobTitle: 'Основатель Smart Solutions',
  bio: 'Основатель Smart Solutions. Запускаю ИИ в бизнес-процессы с замером эффекта.',
};

export const CONTACTS = {
  phone: '+7 (925) 090-95-00',
  tel: '+79250909500',
  telegram: 'https://t.me/olegkrechetov',
  telegramHandle: '@olegkrechetov',
  whatsapp: 'https://wa.me/79250909500',
  email: 'ok@smartsolutions.today',
  address: 'Москва, ул. Воронцовская, д. 35-Б',
};

export type NavKey = 'approach' | 'projects' | 'process' | 'services' | 'ai' | 'contacts' | 'blog';

// Меню шапки и мобильного меню (как на главной, 6 пунктов).
export const NAV: { key: NavKey; label: string; hash?: string; href?: string }[] = [
  { key: 'approach', label: 'Подход', hash: 'approach' },
  { key: 'projects', label: 'Проекты', hash: 'projects' },
  { key: 'process', label: 'Процесс', hash: 'process' },
  { key: 'services', label: 'Услуги', href: '/services.html' },
  { key: 'ai', label: 'AI', href: '/ai.html' },
  { key: 'contacts', label: 'Контакты', hash: 'contacts' },
];

// Подвал: те же пункты + «AI-направление» и «Блог» (как на главной, 7 пунктов).
/**
 * Три коммерческие посадочные AI-направления. В верхнем меню и подвале их пунктов нет —
 * интент узкий; входы: карточки на /ai.html, блок «AI-направление» на /services.html,
 * ссылка в подвале, блоки «Смотрите также» статей и поиск по сайту на странице 404.
 * Решение владельца 2026-10-12: оставляем разделами, добавляем пути входа.
 */
export const AI_SERVICES: { label: string; href: string; note: string }[] = [
  { label: 'ИИ-агенты', href: '/ai-agenty.html', note: 'Агент выполняет шаги в процессе: CRM, документы, база знаний' },
  { label: 'Автоматизация продаж', href: '/avtomatizaciya-prodazh.html', note: 'Быстрый первый ответ, дожим, данные в CRM без ручного ввода' },
  { label: 'ИИ-ассистент для сайта', href: '/ii-assistent-dlya-sajta.html', note: 'Отвечает посетителям по вашей базе знаний и передаёт диалог менеджеру' },
];

export const FOOTER_NAV: { key: NavKey; label: string; hash?: string; href?: string }[] = [
  { key: 'approach', label: 'Подход', hash: 'approach' },
  { key: 'projects', label: 'Проекты', hash: 'projects' },
  { key: 'process', label: 'Процесс', hash: 'process' },
  { key: 'services', label: 'Услуги', href: '/services.html' },
  { key: 'ai', label: 'AI-направление', href: '/ai.html' },
  { key: 'blog', label: 'Блог', href: '/blog/' },
  { key: 'contacts', label: 'Контакты', hash: 'contacts' },
];

/**
 * Адрес пункта меню с учётом страницы:
 * - якоря главной (#approach…) на главной — просто "#approach" (работает scrollspy),
 *   на остальных — "/#approach";
 * - «Контакты» ведут к блоку контактов на этой же странице, если он есть.
 */
export function navHref(item: { hash?: string; href?: string }, opts: { isHome: boolean; hasContacts: boolean }) {
  if (item.href) return item.href;
  if (item.hash === 'contacts' && opts.hasContacts) return '#contacts';
  return opts.isHome ? `#${item.hash}` : `/#${item.hash}`;
}
