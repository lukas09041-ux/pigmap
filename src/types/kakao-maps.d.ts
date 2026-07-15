export {};

declare global {
  interface Window {
    kakao: typeof kakao;
  }

  namespace kakao.maps {
    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    class LatLngBounds {
      extend(latlng: LatLng): void;
      getSouthWest(): LatLng;
      getNorthEast(): LatLng;
    }

    class Map {
      constructor(container: HTMLElement, options: { center: LatLng; level: number });
      setBounds(bounds: LatLngBounds): void;
      setCenter(latlng: LatLng): void;
      setLevel(level: number): void;
      getLevel(): number;
      getBounds(): LatLngBounds;
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

    namespace event {
      function addListener(target: unknown, type: string, handler: () => void): void;
      function removeListener(target: unknown, type: string, handler: () => void): void;
    }

    function load(callback: () => void): void;
  }
}
