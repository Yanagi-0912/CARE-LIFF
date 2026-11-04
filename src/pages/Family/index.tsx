import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router-dom';
import { MapPinIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react';

import { EntryLink, FeaturePage } from '@/components/FeaturePage';
import FamilyMembersPage from './MembersPage';
import FamilyPermissionsPage from './PermissionsPage';
import FamilyLocationPage from './LocationPage';

function FamilyLandingPage() {
  const { t } = useTranslation();
  return (
    <FeaturePage title={t('familyNavigation.title')} description={t('familyNavigation.description')}>
      <div className="care-entry-list">
        <EntryLink to="/family/members" title={t('familyNavigation.members')}
          description={t('familyNavigation.membersDescription')} icon={UsersIcon} />
        <EntryLink to="/family/permissions" title={t('familyNavigation.permissions')}
          description={t('familyNavigation.permissionsDescription')} icon={ShieldCheckIcon} />
        <EntryLink to="/family/location" title={t('familyNavigation.location')}
          description={t('familyNavigation.locationDescription')} icon={MapPinIcon} />
      </div>
    </FeaturePage>
  );
}

export default function FamilyPage() {
  return (
    <Routes>
      <Route index element={<FamilyLandingPage />} />
      <Route path="members" element={<FamilyMembersPage />} />
      <Route path="permissions" element={<FamilyPermissionsPage />} />
      <Route path="location" element={<FamilyLocationPage />} />
      <Route path="*" element={<Navigate to="/family" replace />} />
    </Routes>
  );
}
