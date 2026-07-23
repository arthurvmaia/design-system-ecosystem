import { Intro } from '@/components/Intro';
import { Shell } from '@/components/Shell';
import { ExtractPage } from '@/routes/Extract';
import { GalleryPage } from '@/routes/Gallery';
import { KitsPage } from '@/routes/Kits';
import { LibraryPage } from '@/routes/Library';
import { MeusProjetosPage } from '@/routes/MeusProjetos';
import { ProjectsPage } from '@/routes/Projects';
import { RevisaoPage } from '@/routes/Revisao';
import { SettingsPage } from '@/routes/Settings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
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
  // A intro abre por cima do app. Quando termina (ou é pulada) ela some e o app
  // fica visível — sem redirecionar para lugar nenhum: faz parte do próprio app.
  const [introVista, setIntroVista] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      {!introVista && <Intro onFinish={() => setIntroVista(true)} />}
      <Router>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Navigate to="/extract" replace />} />
            <Route path="/extract" element={<ExtractPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/revisao" element={<RevisaoPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/design-systems" element={<KitsPage />} />
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
