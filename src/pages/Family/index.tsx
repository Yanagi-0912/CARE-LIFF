import { Navigate, Route, Routes } from 'react-router-dom';

import FamilyPermissionsPage from './PermissionsPage';
import FamilyLocationPage from './LocationPage';
import MemberDetailPage from './MemberDetailPage';
import MemberAccessPage from './MemberAccessPage';
import MemberRolePage from './MemberRolePage';

// 家人名單已併進健康首頁。/family 與 /family/members 仍要接得住：加入成功頁、
// LINE 訊息與舊書籤都還指著它們。
export default function FamilyPage() {
  return (
    <Routes>
      <Route index element={<Navigate to="/" replace />} />
      <Route path="members" element={<Navigate to="/" replace />} />
      <Route path="members/:userId" element={<MemberDetailPage />} />
      <Route path="members/:userId/access" element={<MemberAccessPage />} />
      <Route path="members/:userId/role" element={<MemberRolePage />} />
      <Route path="permissions" element={<FamilyPermissionsPage />} />
      <Route path="location" element={<FamilyLocationPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
