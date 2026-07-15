export {};

declare global {
  interface Window {
    kakao: typeof kakao;
  }

  namespace kakao.maps {
    class LatLng {
      constructor(lat: number, lng: number);
    }

    class LatLngBounds {
      extend(latlng: LatLng): void;
    }

    class Map {
      constructor(container: HTMLElement, options: { center: LatLng; level: number });
      setBounds(bounds: LatLngBounds): void;
      setCenter(latlng: LatLng): void;
      setLevel(level: number): void;
    }

    class CustomOverlay {
      constructor(options: {
        position: LatLng;
        content: HTMLElement | string;
        yAnchor?: number;
        clickable?: boolean;
        zIndex?: number;
      });
      setMap(map: Map | null): void;
    }

    function load(callback: () => void): void;
  }
}
