import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Users, Star, Zap, Eye, Clock, ListFilter as Filter, Layers, Navigation, Plus, Gavel, Camera, Package, X, TrendingUp, ChevronUp, ChevronDown, Shield, Info } from 'lucide-react';

type MarkerType = 'scout' | 'find' | 'auction' | 'estate' | 'garage' | 'thrift' | 'storage';
type HeatmapLayer = 'trending' | 'scouts' | 'rare' | 'auctions';
type BottomSheetState = 'collapsed' | 'half' | 'expanded';
type PopupType = 'scout' | 'find' | null;

interface MapMarker {
  id: string;
  type: MarkerType;
  x: number;
  y: number;
  label: string;
  detail: string;
}

interface NearbyItem {
  id: string;
  type: 'find' | 'auction' | 'scout' | 'radar' | 'trending';
  title: string;
  detail: string;
  timestamp: string;
  urgency?: boolean;
}

const mapMarkers: MapMarker[] = [];

const nearbyItems: NearbyItem[] = [];

const markerColors: Record<MarkerType, string> = {
  scout: 'var(--color-primary-500)',
  find: 'var(--color-success-500)',
  auction: 'var(--color-error-500)',
  estate: 'var(--color-secondary-500)',
  garage: 'var(--color-accent-500)',
  thrift: 'var(--color-warning-500)',
  storage: 'var(--color-neutral-600)',
};

const markerIcons: Record<MarkerType, typeof MapPin> = {
  scout: Users,
  find: Zap,
  auction: Gavel,
  estate: MapPin,
  garage: MapPin,
  thrift: Star,
  storage: Package,
};

export default function ScoutMap({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [bottomSheet, setBottomSheet] = useState<BottomSheetState>('collapsed');
  const [activeFilters, setActiveFilters] = useState<MarkerType[]>([
    'scout', 'find', 'auction', 'estate', 'garage', 'thrift', 'storage',
  ]);
  const [heatmapLayers, setHeatmapLayers] = useState<HeatmapLayer[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [popup, setPopup] = useState<PopupType>(null);
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);

  const toggleFilter = (type: MarkerType) => {
    setActiveFilters((prev) =>
      prev.includes(type) ? prev.filter((f) => f !== type) : [...prev, type]
    );
  };

  const toggleLayer = (layer: HeatmapLayer) => {
    setHeatmapLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer]
    );
  };

  const handleMarkerClick = (marker: MapMarker) => {
    setSelectedMarker(marker);
    setPopup(marker.type === 'scout' ? 'scout' : 'find');
    setBottomSheet('collapsed');
  };

  const visibleMarkers = mapMarkers.filter((m) => activeFilters.includes(m.type));

  return (
    <div style={styles.container}>
      {/* Map area */}
      <div style={styles.mapArea}>
        <MapBackground heatmapLayers={heatmapLayers} />

        {/* Markers */}
        {visibleMarkers.map((marker) => {
          const Icon = markerIcons[marker.type];
          return (
            <button
              key={marker.id}
              onClick={() => handleMarkerClick(marker)}
              style={{
                ...styles.marker,
                left: `${marker.x}%`,
                top: `${marker.y}%`,
                backgroundColor: markerColors[marker.type],
              }}
              aria-label={marker.label}
            >
              <Icon size={12} style={{ color: 'var(--color-neutral-0)' }} />
            </button>
          );
        })}

        {/* Preview banner */}
        <div style={{
          position: 'absolute',
          top: 'var(--space-16, 64px)',
          left: 'var(--space-4)',
          right: 'var(--space-4)',
          zIndex: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          backgroundColor: 'var(--color-neutral-0)',
          border: '1px solid var(--color-warning-200)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <Info size={14} style={{ color: 'var(--color-warning-600)', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-700)', lineHeight: 1.3 }}>
            Map preview — live geo data and nearby scout activity launching soon.
          </span>
        </div>

        {/* Top bar */}
        <div style={styles.topBar}>
          <button onClick={onBack} style={styles.topBtn}>
            <ArrowLeft size={18} />
          </button>
          <div style={styles.searchPill}>
            <Navigation size={14} style={{ color: 'var(--color-primary-500)' }} />
            <span style={styles.searchText}>Your Location</span>
          </div>
          <button onClick={() => setShowLayers(!showLayers)} style={styles.topBtn}>
            <Layers size={18} />
          </button>
        </div>

        {/* Layer toggle panel */}
        {showLayers && (
          <LayerPanel
            activeLayers={heatmapLayers}
            onToggle={toggleLayer}
            onClose={() => setShowLayers(false)}
          />
        )}

        {/* Category filters */}
        {showFilters && (
          <FilterPanel
            activeFilters={activeFilters}
            onToggle={toggleFilter}
            onClose={() => setShowFilters(false)}
          />
        )}

        {/* Popups */}
        {popup === 'scout' && selectedMarker && (
          <ScoutPopup marker={selectedMarker} onClose={() => setPopup(null)} />
        )}
        {popup === 'find' && selectedMarker && (
          <FindPopup marker={selectedMarker} onClose={() => setPopup(null)} />
        )}

        {/* Floating action buttons */}
        <div style={styles.fabGroup}>
          <button style={styles.fabSecondary} onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} style={{ color: 'var(--color-neutral-600)' }} />
          </button>
          <button style={styles.fabPrimary} onClick={() => navigate('/flash-finds')} aria-label="Post a find">
            <Plus size={20} style={{ color: 'var(--color-neutral-0)' }} />
          </button>
        </div>

        {/* Quick action overlay */}
        <QuickActions />
      </div>

      {/* Bottom sheet */}
      <BottomSheet
        state={bottomSheet}
        onToggle={() =>
          setBottomSheet((s) =>
            s === 'collapsed' ? 'half' : s === 'half' ? 'expanded' : 'collapsed'
          )
        }
      />
    </div>
  );
}

function MapBackground({ heatmapLayers }: { heatmapLayers: HeatmapLayer[] }) {
  return (
    <div style={styles.mapBg}>
      {/* Grid lines for map feel */}
      <div style={styles.gridOverlay} />

      {/* Road-like lines */}
      <svg style={styles.roadsSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M 0 40 Q 30 35 50 45 T 100 50" stroke="var(--color-neutral-200)" strokeWidth="0.5" fill="none" />
        <path d="M 20 0 Q 25 30 30 50 T 35 100" stroke="var(--color-neutral-200)" strokeWidth="0.5" fill="none" />
        <path d="M 60 0 Q 65 25 70 50 T 75 100" stroke="var(--color-neutral-200)" strokeWidth="0.4" fill="none" />
        <path d="M 0 70 Q 40 65 60 75 T 100 70" stroke="var(--color-neutral-200)" strokeWidth="0.4" fill="none" />
        <path d="M 0 20 Q 50 18 100 25" stroke="var(--color-neutral-200)" strokeWidth="0.3" fill="none" />
        <path d="M 45 0 L 45 100" stroke="var(--color-neutral-150, var(--color-neutral-200))" strokeWidth="0.3" fill="none" />
      </svg>

      {/* Heatmap layers */}
      {heatmapLayers.includes('trending') && (
        <div style={{ ...styles.heatBlob, left: '30%', top: '30%', backgroundColor: 'rgba(234, 179, 8, 0.12)', width: '35%', height: '30%' }} />
      )}
      {heatmapLayers.includes('scouts') && (
        <div style={{ ...styles.heatBlob, left: '50%', top: '40%', backgroundColor: 'rgba(20, 184, 166, 0.1)', width: '30%', height: '35%' }} />
      )}
      {heatmapLayers.includes('rare') && (
        <div style={{ ...styles.heatBlob, left: '15%', top: '50%', backgroundColor: 'rgba(249, 115, 22, 0.1)', width: '25%', height: '25%' }} />
      )}
      {heatmapLayers.includes('auctions') && (
        <div style={{ ...styles.heatBlob, left: '60%', top: '25%', backgroundColor: 'rgba(239, 68, 68, 0.08)', width: '30%', height: '30%' }} />
      )}
    </div>
  );
}

function LayerPanel({
  activeLayers,
  onToggle,
  onClose,
}: {
  activeLayers: HeatmapLayer[];
  onToggle: (l: HeatmapLayer) => void;
  onClose: () => void;
}) {
  const layers: { key: HeatmapLayer; label: string; color: string }[] = [
    { key: 'trending', label: 'Trending Zones', color: 'var(--color-primary-500)' },
    { key: 'scouts', label: 'Scout Activity', color: 'var(--color-secondary-500)' },
    { key: 'rare', label: 'Rare Find Density', color: 'var(--color-accent-500)' },
    { key: 'auctions', label: 'Hot Auctions', color: 'var(--color-error-500)' },
  ];

  return (
    <div style={styles.layerPanel}>
      <div style={styles.layerPanelHeader}>
        <span style={styles.layerPanelTitle}>Map Layers</span>
        <button onClick={onClose} style={styles.closeSmBtn}>
          <X size={14} />
        </button>
      </div>
      {layers.map((layer) => (
        <button
          key={layer.key}
          onClick={() => onToggle(layer.key)}
          style={{
            ...styles.layerToggle,
            ...(activeLayers.includes(layer.key) ? styles.layerToggleActive : {}),
          }}
        >
          <div style={{ ...styles.layerDot, backgroundColor: layer.color }} />
          <span style={styles.layerLabel}>{layer.label}</span>
          <div
            style={{
              ...styles.toggleSwitch,
              backgroundColor: activeLayers.includes(layer.key)
                ? 'var(--color-primary-500)'
                : 'var(--color-neutral-200)',
            }}
          >
            <div
              style={{
                ...styles.toggleKnob,
                transform: activeLayers.includes(layer.key) ? 'translateX(14px)' : 'translateX(0)',
              }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

function FilterPanel({
  activeFilters,
  onToggle,
  onClose,
}: {
  activeFilters: MarkerType[];
  onToggle: (t: MarkerType) => void;
  onClose: () => void;
}) {
  const filters: { key: MarkerType; label: string }[] = [
    { key: 'scout', label: 'Scouts' },
    { key: 'find', label: 'Flash Finds' },
    { key: 'auction', label: 'Auctions' },
    { key: 'estate', label: 'Estate Sales' },
    { key: 'garage', label: 'Garage Sales' },
    { key: 'thrift', label: 'Thrift Stores' },
    { key: 'storage', label: 'Storage Units' },
  ];

  return (
    <div style={styles.filterPanel}>
      <div style={styles.layerPanelHeader}>
        <span style={styles.layerPanelTitle}>Show on Map</span>
        <button onClick={onClose} style={styles.closeSmBtn}>
          <X size={14} />
        </button>
      </div>
      <div style={styles.filterGrid}>
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => onToggle(f.key)}
            style={{
              ...styles.filterChip,
              ...(activeFilters.includes(f.key) ? { backgroundColor: markerColors[f.key], color: 'var(--color-neutral-0)' } : {}),
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoutPopup({ marker, onClose }: { marker: MapMarker; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <div style={styles.popupOverlay} onClick={onClose}>
      <div style={styles.popupCard} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={styles.popupClose}>
          <X size={16} />
        </button>
        <div style={styles.popupScoutHeader}>
          <div style={styles.popupAvatar}>
            <Users size={20} style={{ color: 'var(--color-neutral-400)' }} />
          </div>
          <div style={styles.popupScoutInfo}>
            <div style={styles.popupNameRow}>
              <span style={styles.popupName}>{marker.label}</span>
              <Shield size={12} style={{ color: 'var(--color-primary-500)' }} />
            </div>
            <span style={styles.popupDetail}>{marker.detail}</span>
          </div>
        </div>

        <div style={styles.popupStats}>
          <div style={styles.popupStat}>
            <span style={styles.popupStatNum}>4.9</span>
            <span style={styles.popupStatLabel}>Rating</span>
          </div>
          <div style={styles.popupStatDivider} />
          <div style={styles.popupStat}>
            <span style={styles.popupStatNum}>64</span>
            <span style={styles.popupStatLabel}>Jobs</span>
          </div>
          <div style={styles.popupStatDivider} />
          <div style={styles.popupStat}>
            <span style={styles.popupStatNum}>&lt;30m</span>
            <span style={styles.popupStatLabel}>Response</span>
          </div>
        </div>

        <div style={styles.popupSpecialties}>
          <span style={styles.specChip}>Furniture</span>
          <span style={styles.specChip}>Antiques</span>
          <span style={styles.specChip}>Estate Sales</span>
        </div>

        <div style={styles.popupStatusRow}>
          <div style={styles.activeDot} />
          <span style={styles.activeLabel}>Active now</span>
          <span style={styles.pickupCount}>18 pickups completed</span>
        </div>

        <button style={styles.popupCta} onClick={() => { onClose(); navigate('/rare-radar'); }}>
          <span style={styles.popupCtaText}>Request Help</span>
        </button>
      </div>
    </div>
  );
}

function FindPopup({ marker, onClose }: { marker: MapMarker; onClose: () => void }) {
  const navigate = useNavigate();
  const isAuction = marker.type === 'auction';

  return (
    <div style={styles.popupOverlay} onClick={onClose}>
      <div style={styles.popupCard} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={styles.popupClose}>
          <X size={16} />
        </button>

        <div style={styles.findPopupImage}>
          <img
            src="https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=300"
            alt={marker.label}
            style={styles.findImage}
          />
          {isAuction && (
            <span style={styles.findTimeBadge}>
              <Clock size={10} /> {marker.detail}
            </span>
          )}
        </div>

        <h3 style={styles.findTitle}>{marker.label}</h3>
        <div style={styles.findMeta}>
          <span style={styles.findValue}>{marker.detail}</span>
          <span style={styles.findLocation}>
            <MapPin size={10} /> 0.4 mi away
          </span>
        </div>

        <div style={styles.findScores}>
          <div style={styles.findScore}>
            <span style={styles.findScoreLabel}>Rarity</span>
            <div style={styles.miniBar}>
              <div style={{ ...styles.miniFill, width: '72%' }} />
            </div>
            <span style={styles.findScoreVal}>7.2</span>
          </div>
          <div style={styles.findScore}>
            <span style={styles.findScoreLabel}>Demand</span>
            <div style={styles.miniBar}>
              <div style={{ ...styles.miniFill, width: '85%', backgroundColor: 'var(--color-success-500)' }} />
            </div>
            <span style={styles.findScoreVal}>8.5</span>
          </div>
        </div>

        <div style={styles.findFooter}>
          <span style={styles.findPosted}>
            <Clock size={10} /> Posted 15m ago
          </span>
          <span style={styles.findScouts}>
            <Users size={10} /> 3 scouts nearby
          </span>
        </div>

        <button style={styles.popupCta} onClick={() => { onClose(); navigate('/alerts'); }}>
          <Eye size={16} style={{ color: 'var(--color-neutral-0)' }} />
          <span style={styles.popupCtaText}>Watch Item</span>
        </button>
      </div>
    </div>
  );
}

function QuickActions() {
  const navigate = useNavigate();
  return (
    <div style={styles.quickActionsRow}>
      <button style={styles.quickChip} onClick={() => navigate('/flash-finds')}>
        <Camera size={12} /> Post Find
      </button>
      <button style={styles.quickChip} onClick={() => navigate('/rare-radar')}>
        <Navigation size={12} /> Start Hunt
      </button>
      <button style={styles.quickChip} onClick={() => navigate('/rare-radar')}>
        <Users size={12} /> Recruit Scout
      </button>
      <button style={styles.quickChip} onClick={() => navigate('/auctions')}>
        <Gavel size={12} /> Auctions
      </button>
    </div>
  );
}

function BottomSheet({
  state,
  onToggle,
}: {
  state: BottomSheetState;
  onToggle: () => void;
}) {
  const height = state === 'collapsed' ? '80px' : state === 'half' ? '45%' : '75%';

  return (
    <div style={{ ...styles.bottomSheet, height }}>
      <button onClick={onToggle} style={styles.sheetHandle}>
        <div style={styles.handleBar} />
        <div style={styles.sheetHeaderRow}>
          <span style={styles.sheetTitle}>Nearby Activity</span>
          {state === 'collapsed' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {state !== 'collapsed' && (
        <div style={styles.sheetContent}>
          {nearbyItems.map((item, index) => (
            <div
              key={item.id}
              style={{ ...styles.nearbyCard, animationDelay: `${index * 60}ms` }}
            >
              <div
                style={{
                  ...styles.nearbyIcon,
                  backgroundColor: item.type === 'find' ? 'var(--color-success-50)'
                    : item.type === 'auction' ? 'var(--color-error-50)'
                    : item.type === 'scout' ? 'var(--color-primary-50)'
                    : item.type === 'radar' ? 'var(--color-secondary-50)'
                    : 'var(--color-accent-50)',
                }}
              >
                {item.type === 'find' && <Zap size={14} style={{ color: 'var(--color-success-600)' }} />}
                {item.type === 'auction' && <Gavel size={14} style={{ color: 'var(--color-error-600)' }} />}
                {item.type === 'scout' && <Users size={14} style={{ color: 'var(--color-primary-600)' }} />}
                {item.type === 'radar' && <Eye size={14} style={{ color: 'var(--color-secondary-600)' }} />}
                {item.type === 'trending' && <TrendingUp size={14} style={{ color: 'var(--color-accent-600)' }} />}
              </div>
              <div style={styles.nearbyInfo}>
                <span style={styles.nearbyTitle}>{item.title}</span>
                <span style={styles.nearbyDetail}>{item.detail}</span>
              </div>
              <div style={styles.nearbyRight}>
                <span style={{
                  ...styles.nearbyTime,
                  color: item.urgency ? 'var(--color-error-600)' : 'var(--color-neutral-400)',
                  fontWeight: item.urgency ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)',
                }}>
                  {item.timestamp}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'var(--color-neutral-100)',
  },

  // Map
  mapArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  mapBg: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'var(--color-neutral-50)',
  },
  gridOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(var(--color-neutral-100) 1px, transparent 1px),
      linear-gradient(90deg, var(--color-neutral-100) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    opacity: 0.6,
  },
  roadsSvg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  heatBlob: {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(20px)',
    transition: 'opacity 0.4s ease',
  },

  // Markers
  marker: {
    position: 'absolute',
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-full)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: 'translate(-50%, -50%)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    border: '2px solid var(--color-neutral-0)',
    zIndex: 10,
    transition: 'transform 0.2s ease',
  },
  cluster: {
    position: 'absolute',
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
    border: '2px dashed var(--color-primary-400)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: 'translate(-50%, -50%)',
    zIndex: 5,
  },
  clusterCount: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 'var(--space-4)',
    left: 'var(--space-4)',
    right: 'var(--space-4)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    zIndex: 20,
  },
  topBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-0)',
    boxShadow: 'var(--shadow-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-700)',
    flexShrink: 0,
  },
  searchPill: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-full)',
    boxShadow: 'var(--shadow-md)',
  },
  searchText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },

  // Layer panel
  layerPanel: {
    position: 'absolute',
    top: '64px',
    right: 'var(--space-4)',
    width: '200px',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    padding: 'var(--space-3)',
    zIndex: 25,
  },
  layerPanelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  layerPanelTitle: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-800)',
  },
  closeSmBtn: {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-400)',
  },
  layerToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-2) 0',
  },
  layerToggleActive: {},
  layerDot: {
    width: '8px',
    height: '8px',
    borderRadius: 'var(--radius-full)',
    flexShrink: 0,
  },
  layerLabel: {
    flex: 1,
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-700)',
    textAlign: 'left',
  },
  toggleSwitch: {
    width: '28px',
    height: '14px',
    borderRadius: 'var(--radius-full)',
    position: 'relative',
    transition: 'background-color 0.2s ease',
  },
  toggleKnob: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '10px',
    height: '10px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-0)',
    transition: 'transform 0.2s ease',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  },

  // Filter panel
  filterPanel: {
    position: 'absolute',
    bottom: '96px',
    left: 'var(--space-4)',
    right: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    padding: 'var(--space-4)',
    zIndex: 25,
    maxHeight: '50%',
    overflow: 'auto',
  },
  filterGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },
  filterChip: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
    border: '1px solid transparent',
  },
  filterDivider: {
    height: '1px',
    backgroundColor: 'var(--color-neutral-100)',
    margin: 'var(--space-3) 0',
  },
  filterSectionLabel: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-500)',
    marginBottom: 'var(--space-2)',
    display: 'block',
  },
  catFilterChip: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-50)',
    color: 'var(--color-neutral-600)',
    border: '1px solid var(--color-neutral-200)',
  },

  // FABs
  fabGroup: {
    position: 'absolute',
    bottom: '96px',
    right: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    zIndex: 15,
  },
  fabPrimary: {
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.4)',
  },
  fabSecondary: {
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-0)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'var(--shadow-md)',
  },

  // Quick actions
  quickActionsRow: {
    position: 'absolute',
    bottom: '96px',
    left: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    zIndex: 15,
  },
  quickChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-0)',
    boxShadow: 'var(--shadow-sm)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
    whiteSpace: 'nowrap',
  },

  // Popup overlay
  popupOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    padding: 'var(--space-6)',
  },
  popupCard: {
    width: '100%',
    maxWidth: '300px',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    boxShadow: 'var(--shadow-lg)',
    position: 'relative',
  },
  popupClose: {
    position: 'absolute',
    top: 'var(--space-3)',
    right: 'var(--space-3)',
    width: '24px',
    height: '24px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-500)',
  },

  // Scout popup
  popupScoutHeader: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
  },
  popupAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  popupScoutInfo: {
    flex: 1,
  },
  popupNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },
  popupName: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  popupDetail: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  popupStats: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-3)',
  },
  popupStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  popupStatNum: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  popupStatLabel: {
    fontSize: '10px',
    color: 'var(--color-neutral-400)',
  },
  popupStatDivider: {
    width: '1px',
    height: '24px',
    backgroundColor: 'var(--color-neutral-200)',
  },
  popupSpecialties: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
  },
  specChip: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
  },
  popupStatusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-4)',
  },
  activeDot: {
    width: '6px',
    height: '6px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success-500)',
  },
  activeLabel: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-success-600)',
  },
  pickupCount: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
    marginLeft: 'auto',
  },
  popupCta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
  },
  popupCtaText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)',
  },

  // Find popup
  findPopupImage: {
    position: 'relative',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    marginBottom: 'var(--space-3)',
    aspectRatio: '16/9',
  },
  findImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  findTimeBadge: {
    position: 'absolute',
    top: 'var(--space-2)',
    right: 'var(--space-2)',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-error-500)',
    color: 'var(--color-neutral-0)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
  },
  findTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-1)',
  },
  findMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  findValue: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-success-600)',
  },
  findLocation: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  findScores: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },
  findScore: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  findScoreLabel: {
    fontSize: '10px',
    color: 'var(--color-neutral-400)',
    width: '40px',
  },
  miniBar: {
    flex: 1,
    height: '4px',
    backgroundColor: 'var(--color-neutral-200)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  miniFill: {
    height: '100%',
    backgroundColor: 'var(--color-primary-500)',
    borderRadius: 'var(--radius-full)',
  },
  findScoreVal: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-700)',
    width: '20px',
    textAlign: 'right',
  },
  findFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  findPosted: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  findScouts: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },

  // Bottom sheet
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'var(--color-neutral-0)',
    borderTopLeftRadius: 'var(--radius-lg)',
    borderTopRightRadius: 'var(--radius-lg)',
    boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
    zIndex: 20,
    transition: 'height 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
  },
  sheetHandle: {
    width: '100%',
    padding: 'var(--space-3) var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexShrink: 0,
  },
  handleBar: {
    width: '32px',
    height: '4px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-200)',
  },
  sheetHeaderRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  sheetContent: {
    flex: 1,
    overflow: 'auto',
    padding: '0 var(--space-4) var(--space-4)',
  },
  nearbyCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) 0',
    borderBottom: '1px solid var(--color-neutral-50)',
    animation: 'slideUp 0.3s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  nearbyIcon: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nearbyInfo: {
    flex: 1,
    minWidth: 0,
  },
  nearbyTitle: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nearbyDetail: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  nearbyRight: {
    flexShrink: 0,
  },
  nearbyTime: {
    fontSize: '10px',
  },
};
