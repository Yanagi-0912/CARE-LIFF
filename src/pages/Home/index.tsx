import { useNavigate } from 'react-router-dom';
import './index.css';

/** * 首頁主入口：提供四個主要功能導航
 * 整合登入狀態判斷與登出邏輯
 */
const Home = () => {
  const navigate = useNavigate();

  // 判斷當前是否已登入 (檢查 localStorage 是否有 Token)
  const isLoggedIn = !!localStorage.getItem('CARE_AUTH_TOKEN');

  // 定義功能卡片配置
  const features = [
    { 
      title: '個人健康', 
      icon: '🏥', 
      path: '/personalhealth', 
      desc: '紀錄與預約' 
    },
    { 
      title: '家庭介面', 
      icon: '👥', 
      path: '/family', 
      desc: '管理家人狀況' 
    },
    { 
      title: '設定頁面', 
      icon: '⚙️', 
      path: '/settings', 
      desc: '系統偏好設定' 
    },
    { 
      // 根據狀態切換文字與描述
      title: isLoggedIn ? '帳號登出' : '帳號登入', 
      icon: '🔑', 
      path: '/login', 
      desc: isLoggedIn ? '登出目前帳號' : '切換 LINE 帳號',
      isAuthAction: true // 標記這是身分驗證相關的操作
    },
  ];

  /** 處理卡片點擊事件 */
  const handleCardClick = (feature: typeof features[0]) => {
    if (feature.isAuthAction && isLoggedIn) {
      // 執行登出邏輯：清除 Token
      localStorage.removeItem('CARE_AUTH_TOKEN');
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
            className="feature-card" 
            onClick={() => handleCardClick(f)}
          >
            <span className="card-icon">{f.icon}</span>
            <div className="card-info">
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          </button>
        ))}
      </section>
    </div>
  );
};

export default Home;