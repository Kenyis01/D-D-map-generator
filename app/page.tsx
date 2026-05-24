import Gallery from "@/components/Gallery";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif-title text-3xl text-accent">Galería de mapas</h1>
          <p className="text-sm text-muted">
            Mapas generados por la comunidad. Descargá, modificá o eliminá cualquiera.
          </p>
        </div>
      </div>
      <Gallery />

      <a
        href="/generate"
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-bg shadow-lg shadow-black/40 hover:brightness-110"
      >
        ＋ Crear nuevo mapa
      </a>
    </div>
  );
}
