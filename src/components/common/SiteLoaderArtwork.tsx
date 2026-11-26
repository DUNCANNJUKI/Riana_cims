import logo from "../../../public/pwa/startup-mark-v3.png?inline";
import "./SiteLoader.css";

export function SiteLoaderArtwork({ status = "Initializing workspace…" }: { status?: string }) {
  return (
    <div className="riana-loader">
      <svg className="riana-loader__network" viewBox="0 0 320 110" aria-hidden="true">
        <path d="M16 42 52 27 90 49 115 34 M35 81 75 66 90 49 M205 72 233 55 273 37 304 58 M233 55 267 82 295 76" />
        <g>
          <circle cx="16" cy="42" r="2" /><circle cx="52" cy="27" r="2.5" />
          <circle cx="90" cy="49" r="3" /><circle cx="35" cy="81" r="2" />
          <circle cx="75" cy="66" r="2" /><circle cx="233" cy="55" r="3" />
          <circle cx="273" cy="37" r="2.5" /><circle cx="304" cy="58" r="2" />
          <circle cx="267" cy="82" r="2" /><circle cx="295" cy="76" r="2" />
        </g>
      </svg>
      <img className="riana-loader__logo" src={logo} alt="" />
      <div className="riana-loader__details">
        <div className="riana-loader__title">RIANA CIMS</div>
        <div className="riana-loader__progress" role="progressbar" aria-label="Initializing application" />
        <p className="riana-loader__status" role="status">{status}</p>
      </div>
    </div>
  );
}
