import { Intro } from '@/components/Intro';
import { PortaoOrbis } from '@/components/PortaoOrbis';
import { Shell } from '@/components/Shell';
import { aplicarMovimento, usePreferencias } from '@/lib/preferencias';
import { CriativosPage } from '@/routes/Criativos';
import { ExtractPage } from '@/routes/Extract';
import { GalleryPage } from '@/routes/Gallery';
import { KitsPage } from '@/routes/Kits';
import { LibraryPage } from '@/routes/Library';
import { MeusProjetosPage } from '@/routes/MeusProjetos';
import { RevisaoPage } from '@/routes/Revisao';
import { SettingsPage } from '@/routes/Settings';
import { PaginaDaFormulaDoKit } from '@/routes/kits/PaginaDaFormula';
import { PADRAO_DA_ROTA_DA_FORMULA } from '@/routes/kits/rota-da-formula';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { TrabalhoProvider } from './lib/trabalho';
import { ExpressoPage } from './routes/Expresso';
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
      {/* O portão vem ANTES da abertura, e é decisão de produto: a abertura é o
          app se apresentando, e apresentar-se a quem ainda não provou que pode
          entrar é dar o passeio antes de pedir o convite. */}
      <PortaoOrbis>
        {!introVista && (
          <Intro
            onFinish={() => {
              setIntroVista(true);
              definir({ jaViuIntro: true });
            }}
          />
        )}
        <Router>
          <TrabalhoProvider>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<Navigate to="/inicio" replace />} />
                <Route path="inicio" element={<HomePage />} />
                <Route path="/expresso" element={<ExpressoPage />} />
                {/* A ala de criativos ainda em ensaio: acessível só por URL.
                    Ligar o ConviteOrbisCriativos aqui é o passo 6 da espec —
                    porta aberta antes do motor seria porta para lugar nenhum. */}
                <Route path="/criativos" element={<CriativosPage />} />
                <Route path="/extract" element={<ExtractPage />} />
                <Route path="/gallery" element={<GalleryPage />} />
                <Route path="/revisao" element={<RevisaoPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/design-systems" element={<KitsPage />} />
                {/* A fórmula é um DESTINO, não um pop-up: com endereço próprio ela
                  pode ser mandada por link e apontada de qualquer tela. O modal
                  do card continua existindo como atalho para quem já está aqui.
                  O caminho fica debaixo de `/design-systems` de propósito — é o
                  que mantém "Kits" aceso na navegação enquanto se lê a fórmula. */}
                <Route path={PADRAO_DA_ROTA_DA_FORMULA} element={<PaginaDaFormulaDoKit />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/meus-projetos" element={<MeusProjetosPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/inicio" replace />} />
              </Route>
            </Routes>
          </TrabalhoProvider>
        </Router>
      </PortaoOrbis>
    </QueryClientProvider>
  );
}
