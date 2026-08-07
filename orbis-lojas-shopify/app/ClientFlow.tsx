"use client";

import { ArrowLeft, ArrowRight, Check, CircleAlert, Download, FolderOpen, RefreshCw, Store } from "lucide-react";
import { useState } from "react";
import { Orbis } from "@/app/Orbis";
import { ClientSitePreview } from "@/app/ClientSitePreview";
import { SECTION_LABELS, SITE_TEMPLATES } from "@/lib/site-generator.mjs";

/**
 * O balcão do cliente: quatro passos e um site na mão.
 *
 * Deliberadamente simples: nada de editor, nada de tokens, nada de jargão de
 * tema. A pessoa conta quem é a marca, confirma o tema (só ShrinePro por
 * enquanto), escolhe uma das duas composições e recebe o site pronto na Área
 * de Trabalho, em ZIP e em pasta aberta. O projeto correspondente nasce de
 * verdade no estúdio ADM.
 */

type Brand = {
  name: string;
  slogan: string;
  description: string;
  primaryColor: string;
  backgroundColor: string;
  whatsapp: string;
  instagram: string;
  email: string;
  logoDataUri: string;
};

const EMPTY_BRAND: Brand = {
  name: "",
  slogan: "",
  description: "",
  primaryColor: "#0e7490",
  backgroundColor: "#f6f8f7",
  whatsapp: "",
  instagram: "",
  email: "",
  logoDataUri: "",
};

type Delivery = { zipPath: string; folderPath: string; entryPath: string } | null;
type Status = "idle" | "working" | "done" | "error";

const STEPS = ["Sua marca", "Tema", "Modelo", "Revisão"] as const;

export function ClientFlow({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState(0);
  const [brand, setBrand] = useState<Brand>(EMPTY_BRAND);
  const [templateId, setTemplateId] = useState<string>(SITE_TEMPLATES[0].id);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<Delivery>(null);
  const [zip, setZip] = useState<{ blob: Blob; name: string } | null>(null);

  const template = SITE_TEMPLATES.find((entry) => entry.id === templateId) ?? SITE_TEMPLATES[0];
  const canAdvance = step !== 0 || brand.name.trim().length >= 2;

  function set<K extends keyof Brand>(key: K, value: Brand[K]) {
    setBrand((current) => ({ ...current, [key]: value }));
  }

  function chooseLogo(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 1_400_000) {
      setError("A logo precisa ser PNG, JPG ou WebP de até 1,4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("logoDataUri", String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function downloadZip(current: { blob: Blob; name: string } | null) {
    if (!current) return;
    const url = URL.createObjectURL(current.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `site-${current.name}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function requestSite() {
    setStatus("working");
    setError(null);
    try {
      const response = await fetch("/api/client-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand, templateId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Não consegui gerar o site agora. Tente novamente.");
      }
      const blob = await response.blob();
      const name = response.headers.get("x-site-name") ?? "minha-marca";
      const bundle = { blob, name };
      setZip(bundle);

      const deliver = await fetch(`/local/deliver-site?name=${encodeURIComponent(name)}`, { method: "POST", body: blob });
      if (deliver.ok) {
        setDelivery(await deliver.json());
      } else {
        setDelivery(null);
        downloadZip(bundle);
      }
      setStatus("done");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não consegui gerar o site agora.");
      setStatus("error");
    }
  }

  function reset() {
    setStep(0);
    setBrand(EMPTY_BRAND);
    setTemplateId(SITE_TEMPLATES[0].id);
    setStatus("idle");
    setError(null);
    setDelivery(null);
    setZip(null);
  }

  if (status === "working") {
    return (
      <main className="client-flow">
        <div className="entry-gate-brilho" aria-hidden="true" />
        <div className="cf-panel cf-center">
          <Orbis tamanho={96} girando alt="Orbis montando o site" />
          <h2>Montando o site de {brand.name.trim() || "sua marca"}…</h2>
          <p>Estou aplicando sua marca ao tema, gerando as páginas e embrulhando tudo para o senhor.</p>
        </div>
      </main>
    );
  }

  if (status === "done") {
    return (
      <main className="client-flow">
        <div className="entry-gate-brilho" aria-hidden="true" />
        <div className="cf-panel cf-center">
          <span className="cf-done-badge"><Check size={26} strokeWidth={2.4} /></span>
          <h2>Site pronto, senhor.</h2>
          {delivery ? (
            <>
              <p>Deixei tudo na sua Área de Trabalho. Para ver o site, abra a pasta e clique duas vezes no <b>index.html</b>.</p>
              <div className="cf-paths">
                <div><FolderOpen size={15} /> <span>{delivery.folderPath}</span></div>
                <div><Download size={15} /> <span>{delivery.zipPath}</span></div>
              </div>
            </>
          ) : (
            <p>Não consegui gravar direto na Área de Trabalho, então baixei o ZIP pelo navegador. Extraia e clique no <b>index.html</b>.</p>
          )}
          <div className="cf-actions">
            <button className="secondary-button" onClick={() => downloadZip(zip)}><Download size={15} /> Baixar o ZIP</button>
            <button className="secondary-button" onClick={reset}><RefreshCw size={15} /> Fazer outro site</button>
            <button className="primary-button" onClick={onExit}>Concluir <ArrowRight size={15} /></button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="client-flow">
      <div className="entry-gate-brilho" aria-hidden="true" />
      <div className="cf-layout">
      <div className="cf-panel">
        <header className="cf-head">
          <Orbis tamanho={40} alt="" />
          <div>
            <strong>Solicitar meu site</strong>
            <small>Quatro passos e o site sai no seu computador.</small>
          </div>
          <button className="text-button" onClick={onExit}>Sair</button>
        </header>

        <ol className="cf-steps">
          {STEPS.map((label, index) => (
            <li key={label} className={index === step ? "active" : index < step ? "done" : ""}>
              <i>{index < step ? <Check size={11} /> : index + 1}</i>
              {label}
            </li>
          ))}
        </ol>

        {error && <div className="error-banner" role="alert"><CircleAlert size={16} /><span>{error}</span><button onClick={() => setError(null)}>Entendi</button></div>}

        {step === 0 && (
          <div className="cf-body">
            <label className="cf-field">
              <span>Nome da marca *</span>
              <input value={brand.name} maxLength={48} placeholder="Ex.: Aurora Café" onChange={(event) => set("name", event.target.value)} />
            </label>
            <label className="cf-field">
              <span>Slogan (opcional)</span>
              <input value={brand.slogan} maxLength={140} placeholder="Uma frase curta que apresenta a marca" onChange={(event) => set("slogan", event.target.value)} />
            </label>
            <label className="cf-field">
              <span>Descrição (opcional)</span>
              <textarea value={brand.description} maxLength={240} rows={2} placeholder="O que você vende e para quem" onChange={(event) => set("description", event.target.value)} />
            </label>
            <div className="cf-row">
              <label className="cf-field">
                <span>Cor principal</span>
                <span className="cf-color"><input type="color" value={brand.primaryColor} onChange={(event) => set("primaryColor", event.target.value)} /><code>{brand.primaryColor}</code></span>
              </label>
              <label className="cf-field">
                <span>Cor de fundo</span>
                <span className="cf-color"><input type="color" value={brand.backgroundColor} onChange={(event) => set("backgroundColor", event.target.value)} /><code>{brand.backgroundColor}</code></span>
              </label>
              <label className="cf-field">
                <span>Logo (opcional)</span>
                <span className="cf-logo">
                  {/* eslint-disable-next-line @next/next/no-img-element -- prévia de data URI local; não passa pelo otimizador. */}
                  {brand.logoDataUri && <img src={brand.logoDataUri} alt="Logo escolhida" />}
                  <label className="secondary-button">{brand.logoDataUri ? "Trocar" : "Enviar"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseLogo(event.target.files?.[0])} /></label>
                </span>
              </label>
            </div>
            <div className="cf-row">
              <label className="cf-field"><span>WhatsApp (opcional)</span><input value={brand.whatsapp} maxLength={20} placeholder="5511999998888" onChange={(event) => set("whatsapp", event.target.value)} /></label>
              <label className="cf-field"><span>Instagram (opcional)</span><input value={brand.instagram} maxLength={60} placeholder="@suamarca" onChange={(event) => set("instagram", event.target.value)} /></label>
              <label className="cf-field"><span>E-mail (opcional)</span><input value={brand.email} maxLength={120} placeholder="contato@suamarca.com" onChange={(event) => set("email", event.target.value)} /></label>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="cf-body">
            <div className="cf-theme-card selected">
              <Store size={22} strokeWidth={1.6} />
              <div>
                <strong>ShrinePro</strong>
                <p>Tema de conversão para lojas: vitrine, prova social, comparação e captura de contatos. Outros temas chegarão em breve.</p>
              </div>
              <span className="cf-selected-badge"><Check size={12} /> Selecionado</span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="cf-body cf-templates">
            {SITE_TEMPLATES.map((entry) => (
              <button key={entry.id} className={`cf-template ${templateId === entry.id ? "selected" : ""}`} onClick={() => setTemplateId(entry.id)}>
                <span className="cf-template-thumb" aria-hidden="true">
                  {entry.sections.filter((section) => section !== "announcement").slice(0, 6).map((section) => <i key={section} data-kind={section} />)}
                </span>
                <strong>{entry.name}</strong>
                <p>{entry.tagline}</p>
                <span className="cf-template-sections">{entry.sections.map((section) => SECTION_LABELS[section as keyof typeof SECTION_LABELS]).join(" · ")}</span>
                {templateId === entry.id && <span className="cf-selected-badge"><Check size={12} /> Escolhido</span>}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="cf-body">
            <dl className="cf-review">
              <div><dt>Marca</dt><dd>{brand.name.trim() || "Minha Marca"}</dd></div>
              {brand.slogan && <div><dt>Slogan</dt><dd>{brand.slogan}</dd></div>}
              <div><dt>Cores</dt><dd><i className="cf-swatch" style={{ background: brand.primaryColor }} /> {brand.primaryColor} · <i className="cf-swatch" style={{ background: brand.backgroundColor }} /> {brand.backgroundColor}</dd></div>
              <div><dt>Tema</dt><dd>ShrinePro</dd></div>
              <div><dt>Modelo</dt><dd>{template.name}: {template.tagline}</dd></div>
              {(brand.whatsapp || brand.instagram || brand.email) && <div><dt>Contato</dt><dd>{[brand.whatsapp, brand.instagram, brand.email].filter(Boolean).join(" · ")}</dd></div>}
              <div><dt>Entrega</dt><dd>ZIP e pasta prontos na sua Área de Trabalho, com o site abrindo pelo index.html.</dd></div>
            </dl>
          </div>
        )}

        <footer className="cf-foot">
          {step > 0 ? <button className="secondary-button" onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> Voltar</button> : <span />}
          {step < STEPS.length - 1 ? (
            <button className="primary-button" disabled={!canAdvance} onClick={() => setStep(step + 1)}>Avançar <ArrowRight size={15} /></button>
          ) : (
            <button className="primary-button" onClick={() => void requestSite()}>Solicitar meu site <ArrowRight size={15} /></button>
          )}
        </footer>
      </div>
      <aside className="cf-preview" aria-label="Prévia do site">
        <span className="cf-preview-title">Prévia ao vivo</span>
        <ClientSitePreview brand={brand} sections={template.sections} />
      </aside>
      </div>
    </main>
  );
}
