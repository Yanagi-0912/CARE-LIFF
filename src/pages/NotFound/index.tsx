import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CompassIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

/**
 * 未知路由。網址打錯、或 LINE Console 的 Endpoint 路徑設錯時會落到這裡——
 * 原本 <Routes> 沒有 path="*"，畫面只剩上下導覽列，中間一片空白。
 */
export default function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CompassIcon />
        </EmptyMedia>
        <EmptyTitle>
          <h1>{t('notFound.title')}</h1>
        </EmptyTitle>
        <EmptyDescription>{t('notFound.desc')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {/* 預設尺寸 h-11 = 44px，符合高齡觸控目標下限 */}
        <Button type="button" onClick={() => navigate('/')}>
          {t('common.backHome')}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
