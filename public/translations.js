const translations = {
  en: {
    nav: {
      services: "Services",
      book: "Book Now",
      faq: "FAQ",
      contact: "Contact"
    },
    hero: {
      title: "Professional Cleaning Services in Italy",
      subtitle: "Trusted, reliable cleaning for your home or business. Serving Rome and Milan.",
      cta: "Book Now",
      feature1: "Trusted Professionals",
      feature2: "Flexible Scheduling",
      feature3: "Secure Payment"
    },
    services: {
      title: "Our Services",
      subtitle: "Choose the perfect cleaning service for your needs",
      regular: "Regular Cleaning",
      regularDesc: "Weekly or bi-weekly cleaning for homes",
      onetime: "One-time Cleaning",
      onetimeDesc: "Single deep clean for any occasion",
      deep: "Deep Cleaning",
      deepDesc: "Thorough cleaning including hard-to-reach areas",
      move: "Move-in/Move-out",
      moveDesc: "Complete cleaning for moving in or out"
    }
  },
  it: {
    nav: {
      services: "Servizi",
      book: "Prenota Ora",
      faq: "FAQ",
      contact: "Contatto"
    },
    hero: {
      title: "Servizi di Pulizia Professionale in Italia",
      subtitle: "Pulizia affidabile e di fiducia per la tua casa o azienda. Serviamo Roma e Milano.",
      cta: "Prenota Ora",
      feature1: "Professionisti Affidabili",
      feature2: "Programmazione Flessibile",
      feature3: "Pagamento Sicuro"
    },
    services: {
      title: "I Nostri Servizi",
      subtitle: "Scegli il servizio di pulizia perfetto per le tue esigenze",
      regular: "Pulizia Regolare",
      regularDesc: "Pulizia settimanale o bisettimanale per le case",
      onetime: "Pulizia Una Tantum",
      onetimeDesc: "Pulizia profonda singola per qualsiasi occasione",
      deep: "Pulizia Profonda",
      deepDesc: "Pulizia approfondita inclusi gli angoli difficili da raggiungere",
      move: "Trasloco Entrata/Uscita",
      moveDesc: "Pulizia completa per trasloco entrata o uscita"
    }
  },
  ka: {
    nav: {
      services: "სერვისები",
      book: "დაჯავშნე ახლა",
      faq: "ხშირად დასმული კითხვები",
      contact: "კონტაქტი"
    },
    hero: {
      title: "პროფესიონალური დასუფავების სერვისები იტალიაში",
      subtitle: "სანდო და საიმედო დასუფავება თქვენი სახლის ან ბიზნესისთვის. მომსახურება რომში და მილანში.",
      cta: "დაჯავშნე ახლა",
      feature1: "სანდო პროფესიონალები",
      feature2: "მოქნილი განრიგი",
      feature3: "უსაფრთხო გადახდა"
    },
    services: {
      title: "ჩვენი სერვისები",
      subtitle: "აირჩიეთ სრულყოფილი დასუფავების სერვისი თქვენი საჭიროებებისთვის",
      regular: "რეგულარული დასუფავება",
      regularDesc: "კვირაში ან ორჯერ კვირაში დასუფავება სახლებისთვის",
      onetime: "ერთჯერადი დასუფავება",
      onetimeDesc: "ერთჯერადი ღრმა დასუფავება ნებისმიერი შემთხვევისთვის",
      deep: "ღრმა დასუფავება",
      deepDesc: "სრულყოფილი დასუფავება მათ შორის რთულად მისაწვდომ ადგილებში",
      move: "შესვლა/გასვლა",
      moveDesc: "სრული დასუფავება შესვლის ან გასვლისთვის"
    }
  },
  ru: {
    nav: {
      services: "Услуги",
      book: "Забронировать сейчас",
      faq: "Часто задаваемые вопросы",
      contact: "Контакт"
    },
    hero: {
      title: "Профессиональные услуги по уборке в Италии",
      subtitle: "Надежная и проверенная уборка для вашего дома или бизнеса. Обслуживаем Рим и Милан.",
      cta: "Забронировать сейчас",
      feature1: "Надежные специалисты",
      feature2: "Гибкое расписание",
      feature3: "Безопасная оплата"
    },
    services: {
      title: "Наши услуги",
      subtitle: "Выберите идеальную услугу по уборке для ваших нужд",
      regular: "Регулярная уборка",
      regularDesc: "Еженедельная или двухнедельная уборка для домов",
      onetime: "Разовая уборка",
      onetimeDesc: "Однократная глубокая уборка для любого случая",
      deep: "Глубокая уборка",
      deepDesc: "Тщательная уборка, включая труднодоступные места",
      move: "Въезд/выезд",
      moveDesc: "Полная уборка для въезда или выезда"
    }
  }
};

let currentLanguage = localStorage.getItem('language') || 'en';

function setLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem('language', lang);
  document.getElementById('current-lang').textContent = lang.toUpperCase();
  const mobileLangElement = document.getElementById('mobile-current-lang');
  if (mobileLangElement) {
    mobileLangElement.textContent = lang.toUpperCase();
  }

  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const keys = key.split('.');
    let value = translations[lang];

    for (const k of keys) {
      if (value && value[k]) {
        value = value[k];
      } else {
        value = null;
        break;
      }
    }

    if (value) {
      element.textContent = value;
    }
  });
}

const languages = ['en', 'it', 'ka', 'ru'];

function toggleLanguage() {
  const currentIndex = languages.indexOf(currentLanguage);
  const nextIndex = (currentIndex + 1) % languages.length;
  setLanguage(languages[nextIndex]);
}

document.addEventListener('DOMContentLoaded', () => {
  setLanguage(currentLanguage);
});
