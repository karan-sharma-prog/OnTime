import { AuthProvider } from './AuthContext';
import AppContent from './AppContent';

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
