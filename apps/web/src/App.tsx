import { Intro } from '@/components/Intro';
import { Shell } from '@/components/Shell';
import { aplicarMovimento, usePreferencias } from '@/lib/preferencias';
import { ExtractPage } from '@/routes/Extract';
import { GalleryPage } from '@/routes/Gallery';
import { KitsPage } from '@/routes/Kits';
import { LibraryPage } from '@/routes/Library';
import { MeusProjetosPage } from '@/routes/MeusProjetos';
import { RevisaoPage } from '@/routes/Revisao';
import { SettingsPage } from '@/routes/Settings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { HomePage } from './routes/Home';
import { ProjectsPage } from './routes/projects';

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
  const movimento = usePreferencias((s) => s.movimento);
  const introAoAbrir = usePreferencias((s) => s.introAoAbrir);
  const jaViuIntro = usePreferencias((s) => s.jaViuIntro);
  const definir = usePreferencias((s) => s.definir);

  // A preferência manual de movimento vira classe global — o CSS respeita
  // como se fosse a preferência do sistema.
  useEffect(() => aplicarMovimento(movimento), [movimento]);

  // A intro abre por cima do app. Por padrão, só na primeira visita — a
  // preferência em Configurações decide se ela volta sempre.
  const [introVista, setIntroVista] = useState(introAoAbrir === 'primeira-vez' && jaViuIntro);

  return (
    <QueryClientProvider client={queryClient}>
      {!introVista && (
        <Intro
          onFinish={() => {
            setIntroVista(true);
            definir({ jaViuIntro: true });
          }}
        />
      )}
      <Router>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Navigate to="/inicio" replace />} />
            <Route path="inicio" element={<HomePage />} />
            <Route path="/extract" element={<ExtractPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/revisao" element={<RevisaoPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/design-systems" element={<KitsPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/meus-projetos" element={<MeusProjetosPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/inicio" replace />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
