import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isAuthenticated, clearAuth } from '../../utils/auth';
import { HealthIcon, FamilyIcon, KnowledgeIcon, SettingsIcon, KeyIcon, SearchIcon } from '../../components/icons';
import DecryptedText from '../../components/DecryptedText/DecryptedText';
import Heartbeat from '../../components/Heartbeat/Heartbeat';
import './index.css';

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
    <div className="home-grid">
      <div className="homeHeroCard">
        <header className="home-hero">
          <h1>
            <DecryptedText
              text={t('home.title')}
              speed={36}
              sequential
              revealDirection="center"
              useOriginalCharsOnly
              animateOn="view"
              className="decrypted-text__revealed"
              encryptedClassName="decrypted-text__encrypted"
            />
          </h1>
          <p>{t('home.subtitle')}</p>
          <Heartbeat tone="onDark" className="home-hero__ekg" />
        </header>
      </div>

      <section className="card-container">
        {features.map((f) => (
          <div
            key={f.path}
            className={`homeFeatureCard tone-${f.tone}`}
          >
            <button
              className="feature-card"
              onClick={() => handleCardClick(f)}
            >
              <span className="card-icon">{f.icon}</span>
              <div className="card-info">
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
              <span className="card-arrow" aria-hidden="true">›</span>
            </button>
          </div>
        ))}
      </section>
    </div>
  );
};

export default Home;