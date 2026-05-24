import GeneratorForm from "@/components/GeneratorForm";

export default function GeneratePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif-title text-3xl text-accent">Generar mapa</h1>
        <p className="text-sm text-muted">
          Describí qué mapa querés y dejá que Gemini Flash lo arme tile por tile.
        </p>
      </div>
      <GeneratorForm />
    </div>
  );
}
