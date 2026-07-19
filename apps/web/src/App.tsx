import { Shell } from '@/components/Shell';
import { ExtractPage } from '@/routes/Extract';
import { GalleryPage } from '@/routes/Gallery';
import { LibraryPage } from '@/routes/Library';
import { MeusProjetosPage } from '@/routes/MeusProjetos';
import { ProjectsPage } from '@/routes/Projects';
import { SettingsPage } from '@/routes/Settings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Navigate to="/extract" replace />} />
            <Route path="/extract" element={<ExtractPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/meus-projetos" element={<MeusProjetosPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/extract" replace />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
