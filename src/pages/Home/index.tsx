import { useNavigate } from 'react-router-dom';
import { isAuthenticated, clearAuth } from '../../utils/auth';
import { HealthIcon, FamilyIcon, SettingsIcon, KeyIcon } from '../../components/icons';
import './index.css';

/** * 首頁主入口：提供四個主要功能導航
 * 整合登入狀態判斷與登出邏輯
 */
const Home = () => {
  const navigate = useNavigate();

  const isLoggedIn = isAuthenticated();

  // 定義功能卡片配置（tone 對應各自的圖示底色）
  const features = [
    {
      title: '個人健康',
      icon: <HealthIcon width={26} height={26} />,
      path: '/personalhealth',
      desc: '紀錄與預約',
      tone: 'teal'
    },
    {
      title: '家庭介面',
      icon: <FamilyIcon width={26} height={26} />,
      path: '/family',
      desc: '管理家人狀況',
      tone: 'violet'
    },
    {
      title: '設定頁面',
      icon: <SettingsIcon width={26} height={26} />,
      path: '/settings',
      desc: '系統偏好設定',
      tone: 'amber'
    },
    {
      // 根據狀態切換文字與描述
      title: isLoggedIn ? '帳號登出' : '帳號登入',
      icon: <KeyIcon width={26} height={26} />,
      path: '/login',
      desc: isLoggedIn ? '登出目前帳號' : '切換 LINE 帳號',
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
      <header className="home-hero">
        <h1>CARE 健康管家</h1>
        <p>點選下方卡片開始管理您的健康</p>
      </header>

      <section className="card-container">
        {features.map((f) => (
          <button
            key={f.path}
            className={`feature-card tone-${f.tone}`}
            onClick={() => handleCardClick(f)}
          >
            <span className="card-icon">{f.icon}</span>
            <div className="card-info">
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
            <span className="card-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </section>
    </div>
  );
};

export default Home;