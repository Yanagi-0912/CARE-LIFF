import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isAuthenticated, clearAuth } from '../../utils/auth';
import { HealthIcon, PillIcon, FamilyIcon, KnowledgeIcon, SettingsIcon, KeyIcon, SearchIcon } from '../../components/icons';
import DecryptedText from '../../components/DecryptedText/DecryptedText';
import { cn } from '@/lib/utils';

// 圖示圓底的 tone 配色。必須是完整字串的查表，不能用 `tone-${f.tone}` 拼接：
// Tailwind 掃描原始碼文字比對 class，拼接出的字串不會出現在檔案裡，規則不會產生。
const TONE_ICON: Record<string, string> = {
  teal: 'bg-[var(--primary-soft)] text-[var(--primary-strong)]',
  violet: 'bg-[var(--violet-soft)] text-[var(--violet)]',
  amber: 'bg-[var(--amber-soft)] text-[var(--amber)]',
  coral: 'bg-[var(--accent-soft)] text-[var(--accent)]',
};

/** * 首頁主入口：提供主要功能導航
 * 整合登入狀態判斷與登出邏輯
 */
const Home = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const isLoggedIn = isAuthenticated();

  // 定義功能卡片配置（tone 對應各自的圖示底色）
  const features = [
    {
      title: t('home.nearbyHospitals'),
      icon: <SearchIcon width={26} height={26} />,
      path: '/nearby-hospitals',
      desc: t('home.nearbyHospitalsDesc'),
      tone: 'teal'
    },
    {
      title: t('home.personalHealth'),
      icon: <HealthIcon width={26} height={26} />,
      path: '/personalhealth',
      desc: t('home.personalHealthDesc'),
      tone: 'teal'
    },
    {
      title: t('home.medications'),
      icon: <PillIcon width={26} height={26} />,
      path: '/medications',
      desc: t('home.medicationsDesc'),
      tone: 'amber'
    },
    {
      title: t('home.family'),
      icon: <FamilyIcon width={26} height={26} />,
      path: '/family',
      desc: t('home.familyDesc'),
      tone: 'violet'
    },
    {
      title: t('home.knowledgeReports'),
      icon: <KnowledgeIcon width={26} height={26} />,
      path: '/knowledge-reports',
      desc: t('home.knowledgeReportsDesc'),
      tone: 'teal'
    },
    {
      title: t('home.settings'),
      icon: <SettingsIcon width={26} height={26} />,
      path: '/settings',
      desc: t('home.settingsDesc'),
      tone: 'amber'
    },
    {
      // 根據狀態切換文字與描述
      title: isLoggedIn ? t('home.logout') : t('home.login'),
      icon: <KeyIcon width={26} height={26} />,
      path: '/login',
      desc: isLoggedIn ? t('home.logoutDesc') : t('home.loginDesc'),
      tone: 'coral',
      isAuthAction: true // 標記這是身分驗證相關的操作
    },
  ];

  /** 處理卡片點擊事件 */
  const handleCardClick = (feature: typeof features[0]) => {
    if (feature.isAuthAction && isLoggedIn) {
      // 執行登出邏輯：清除 Token
      clearAuth();
      // 如果有使用 LIFF，建議也可以加上 liff.logout();
      navigate('/login');
    } else {
      // 一般導向
      navigate(feature.path);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] p-4">
      <div className="animate-hero-in mb-6 overflow-hidden rounded-xl">
        {/* Hero：綠色漸層招呼卡；after 偽元素是緩慢漂移的流光高光 */}
        <header className="relative w-full overflow-hidden bg-[image:var(--hero-bg)] px-6 py-8 text-left text-white after:pointer-events-none after:absolute after:top-[-60%] after:left-[-20%] after:h-[200%] after:w-[55%] after:skew-x-[-18deg] after:animate-hero-shine after:bg-[linear-gradient(100deg,transparent_20%,rgba(255,255,255,0.14)_50%,transparent_80%)] after:content-['']">
          <h1 className="animate-hero-text-in m-0 mb-2 text-[1.7rem] font-extrabold tracking-[0.01em] text-white [animation-delay:120ms] sm:text-[2rem]">
            <DecryptedText
              text={t('home.title')}
              speed={36}
              sequential
              revealDirection="center"
              useOriginalCharsOnly
              animateOn="view"
            />
          </h1>
          <p className="animate-hero-text-in m-0 text-[0.98rem] text-white/88 [animation-delay:220ms]">{t('home.subtitle')}</p>
        </header>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        {features.map((f, index) => (
          <div
            key={f.path}
            className="group animate-card-in min-h-[118px] overflow-hidden rounded-lg border border-hair bg-surface shadow-card transition-[transform,box-shadow,border-color] duration-220 hover:-translate-y-[3px] hover:border-line hover:shadow-pop"
            // 瀑布式進場：依序延遲。原 CSS 以 nth-child(1)~(6) 寫死，第 7 張卡
            // 沒延遲、反而最先出現；改用 index 公式讓整排一致。
            style={{ animationDelay: `${60 + index * 70}ms` }}
          >
            <button
              className="flex h-full w-full cursor-pointer items-center gap-4 rounded-[inherit] border-0 bg-transparent px-6 py-4 text-left text-inherit active:scale-[0.985] lg:flex-col lg:gap-3 lg:px-4 lg:py-8 lg:text-center"
              onClick={() => handleCardClick(f)}
            >
              <span
                className={cn(
                  'inline-flex size-[54px] shrink-0 items-center justify-center rounded-lg transition-transform duration-220 group-hover:rotate-[-4deg] group-hover:scale-108',
                  TONE_ICON[f.tone],
                )}
              >
                {f.icon}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="m-0 text-[1.12rem] font-bold text-ink">{f.title}</h3>
                <p className="mt-[3px] mb-0 text-[0.88rem] text-muted-foreground">{f.desc}</p>
              </div>
              {/* 桌面版卡片改直排置中，箭頭提示收掉 */}
              <span
                className="shrink-0 text-2xl leading-none text-faint transition-[transform,color] duration-140 group-hover:translate-x-[3px] group-hover:text-primary lg:hidden"
                aria-hidden="true"
              >
                ›
              </span>
            </button>
          </div>
        ))}
      </section>
    </div>
  );
};

export default Home;
