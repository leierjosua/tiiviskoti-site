import Link from "next/link";
import V4Nav from "./components/V4Nav";
import V4Footer from "./components/V4Footer";
import SiteScripts from "./components/SiteScripts";

export default function NotFound() {
  return (
    <div className="v4">
      <V4Nav />
      <section className="subhero"><div className="wrap" style={{ textAlign: "center", paddingTop: 20, paddingBottom: 20 }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>🫧</div>
        <h1>Hups — tätä sivua ei löytynyt</h1>
        <p style={{ marginInline: "auto" }}>Sivu on saatettu siivota pois. Muuttosiivouksesi hoidamme kuitenkin loppuun asti.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 26 }}>
          <Link href="/" className="btn btn-p btn-lg">Takaisin etusivulle</Link>
          <a href="/ota-yhteytta" className="btn btn-g btn-lg">Ota yhteyttä</a>
        </div>
      </div></section>
      <V4Footer />
      <SiteScripts />
    </div>
  );
}
