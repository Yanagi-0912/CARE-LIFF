import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HealthIcon, PillIcon, FamilyIcon, KnowledgeIcon, SettingsIcon, SearchIcon } from '../../components/icons';
import DecryptedText from '../../components/DecryptedText/DecryptedText';
import { ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';

// 圖示圓底的 tone 配色。必須是完整字串的查表，不能用 `tone-${f.tone}` 拼接：
// Tailwind 掃描原始碼文字比對 class，拼接出的字串不會出現在檔案裡，規則不會產生。
const TONE_ICON: Record<string, string> = {
  teal: 'bg-[var(--primary-soft)] text-[var(--primary-strong)]',
  violet: 'bg-[var(--violet-soft)] text-[var(--violet)]',
  amber: 'bg-[var(--amber-soft)] text-[var(--amber)]',
  coral: 'bg-[var(--accent-soft)] text-[var(--accent)]',
};

/** * 首頁主入口：提供主要功能導航 */
const Home = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

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
    // 登出已移至設定頁（settings.accountTitle），首頁不再放身分驗證卡片
  ];

  return (
    <div className="mx-auto max-w-[1200px] p-4">
      <Card className="animate-in fade-in slide-in-from-bottom-3 zoom-in-95 fill-mode-both duration-500 mb-6 bg-primary text-primary-foreground">
        <CardContent>
          {/* text-inherit 不可省：@layer base 的 h1{color:var(--ink)} 是直接規則，
              永遠贏過從 Card 的 text-primary-foreground 繼承下來的顏色，
              少了它標題會變成墨色壓在深綠底上（實測 1.6:1）。 */}
          <h1 className="text-[1.7rem] font-extrabold tracking-[0.01em] text-inherit sm:text-[2rem]">
            <DecryptedText
              text={t('home.title')}
              speed={36}
              sequential
              revealDirection="center"
              useOriginalCharsOnly
              animateOn="view"
            />
          </h1>
          <p className="mt-2 opacity-90">{t('home.subtitle')}</p>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, index) => (
          <Item
            key={f.path}
            variant="outline"
            className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-300 cursor-pointer transition-colors hover:bg-muted/40"
            // 瀑布式進場：依序延遲。原 CSS 以 nth-child(1)~(6) 寫死，第 7 張卡
            // 沒延遲、反而最先出現；改用 index 公式讓整排一致。
            style={{ animationDelay: `${60 + index * 70}ms` }}
            render={<button type="button" onClick={() => navigate(f.path)} />}
          >
            <ItemMedia>
              <span
                className={cn(
                  'inline-flex size-13 shrink-0 items-center justify-center rounded-xl',
                  TONE_ICON[f.tone],
                )}
              >
                {f.icon}
              </span>
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="text-lg">{f.title}</ItemTitle>
              <ItemDescription>{f.desc}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <ChevronRightIcon className="size-5 text-muted-foreground" />
            </ItemActions>
          </Item>
        ))}
      </section>
    </div>
  );
};

export default Home;
