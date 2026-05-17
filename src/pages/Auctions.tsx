import { useState } from 'react';
import { ArrowLeft, Clock, MapPin, DollarSign, Users, Eye, Star, TriangleAlert as AlertTriangle, TrendingUp, Gavel, User, Package } from 'lucide-react';

type AuctionView = 'feed' | 'detail' | 'coordinate';

interface AuctionItem {
  id: string;
  title: string;
  image: string;
  auctionHouse: string;
  location: string;
  currentBid: string;
  estimatedValue: string;
  endsIn: string;
  scoutsInterested: number;
  scoutNeeded: boolean;
  pickupOnly: boolean;
  endingSoon: boolean;
  highDemand: boolean;
  category: string;
}

interface RegionalScout {
  id: string;
  username: string;
  rating: number;
  region: string;
  specialties: string[];
  completedJobs: number;
  available: boolean;
  responseTime: string;
}

const auctionItems: AuctionItem[] = [];

const regionalScouts: RegionalScout[] = [];

const CATEGORIES = ['All', 'Furniture', 'Watches', 'Collectibles', 'Books', 'Art', 'Electronics'];

export default function Auctions({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<AuctionView>('feed');
  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');

  const handleViewDetail = (item: AuctionItem) => {
    setSelectedItem(item);
    setView('detail');
  };

  const handleCoordinate = (item: AuctionItem) => {
    setSelectedItem(item);
    setView('coordinate');
  };

  if (view === 'detail' && selectedItem) {
    return (
      <AuctionDetail
        item={selectedItem}
        onBack={() => setView('feed')}
        onCoordinate={() => setView('coordinate')}
      />
    );
  }

  if (view === 'coordinate' && selectedItem) {
    return (
      <ScoutCoordination
        item={selectedItem}
        onBack={() => setView('detail')}
      />
    );
  }

  return (
    <AuctionFeed
      selectedCategory={selectedCategory}
      setSelectedCategory={setSelectedCategory}
      onBack={onBack}
      onViewDetail={handleViewDetail}
      onCoordinate={handleCoordinate}
    />
  );
}

function AuctionFeed({
  selectedCategory,
  setSelectedCategory,
  onBack,
  onViewDetail,
  onCoordinate,
}: {
  selectedCategory: string;
  setSelectedCategory: (c: string) => void;
  onBack: () => void;
  onViewDetail: (item: AuctionItem) => void;
  onCoordinate: (item: AuctionItem) => void;
}) {
  const filtered = selectedCategory === 'All'
    ? auctionItems
    : auctionItems.filter((i) => i.category === selectedCategory);

  const endingSoon = auctionItems.filter((i) => i.endingSoon);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerRow}>
          <button onClick={onBack} style={styles.backBtn}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={styles.title}>Auction Mode</h1>
            <p style={styles.subtitle}>Live auctions and scout coordination</p>
          </div>
        </div>
      </header>

      <div style={styles.content}>
        {endingSoon.length > 0 && (
          <div style={styles.urgentBanner}>
            <Clock size={14} style={{ color: 'var(--color-error-600)' }} />
            <span style={styles.urgentText}>{endingSoon.length} auctions ending within 5 hours</span>
          </div>
        )}

        <div style={styles.categoriesScroll}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                ...styles.catChip,
                ...(selectedCategory === cat ? styles.catChipActive : {}),
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={styles.sectionRow}>
          <h3 style={styles.sectionTitle}>Active Auctions</h3>
          <span style={styles.count}>{filtered.length} listings</span>
        </div>

        <div style={styles.auctionList}>
          {filtered.map((item, index) => (
            <AuctionCard
              key={item.id}
              item={item}
              delay={index * 80}
              onView={() => onViewDetail(item)}
              onScout={() => onCoordinate(item)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AuctionCard({
  item,
  delay,
  onView,
  onScout,
}: {
  item: AuctionItem;
  delay: number;
  onView: () => void;
  onScout: () => void;
}) {
  return (
    <article
      style={{ ...styles.card, animationDelay: `${delay}ms` }}
      onClick={onView}
    >
      <div style={styles.cardImageWrap}>
        <img src={item.image} alt={item.title} style={styles.cardImage} />
        <div style={styles.cardBadges}>
          {item.endingSoon && (
            <span style={styles.badgeEnding}>
              <Clock size={10} /> Ends Soon
            </span>
          )}
          {item.pickupOnly && (
            <span style={styles.badgePickup}>
              <Package size={10} /> Pickup Only
            </span>
          )}
          {item.scoutNeeded && (
            <span style={styles.badgeScout}>
              <Users size={10} /> Scout Needed
            </span>
          )}
        </div>
        {item.highDemand && (
          <span style={styles.badgeHot}>
            <TrendingUp size={10} /> High Demand
          </span>
        )}
      </div>

      <div style={styles.cardBody}>
        <h3 style={styles.cardTitle}>{item.title}</h3>
        <div style={styles.cardMeta}>
          <span style={styles.cardHouse}>
            <Gavel size={11} /> {item.auctionHouse}
          </span>
          <span style={styles.cardLocation}>
            <MapPin size={11} /> {item.location}
          </span>
        </div>

        <div style={styles.cardPricing}>
          <div style={styles.priceCol}>
            <span style={styles.priceLabel}>Current Bid</span>
            <span style={styles.priceValue}>{item.currentBid}</span>
          </div>
          <div style={styles.priceCol}>
            <span style={styles.priceLabel}>Est. Value</span>
            <span style={styles.estValue}>{item.estimatedValue}</span>
          </div>
        </div>

        <div style={styles.cardFooter}>
          <div style={styles.cardFooterLeft}>
            <span style={styles.timerBadge}>
              <Clock size={11} /> {item.endsIn}
            </span>
            <span style={styles.scoutInterest}>
              <Users size={11} /> {item.scoutsInterested}
            </span>
          </div>
          <div style={styles.cardActions}>
            <button
              onClick={(e) => { e.stopPropagation(); onView(); }}
              style={styles.watchBtn}
            >
              <Eye size={14} />
            </button>
            {item.scoutNeeded && (
              <button
                onClick={(e) => { e.stopPropagation(); onScout(); }}
                style={styles.requestScoutBtn}
              >
                Request Scout
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function AuctionDetail({
  item,
  onBack,
  onCoordinate,
}: {
  item: AuctionItem;
  onBack: () => void;
  onCoordinate: () => void;
}) {
  return (
    <div style={styles.container}>
      <header style={styles.stepHeader}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <span style={styles.stepLabel}>Auction Details</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={styles.detailContent}>
        <div style={styles.detailImageWrap}>
          <img src={item.image} alt={item.title} style={styles.detailImage} />
          <div style={styles.detailImageOverlay}>
            <span style={styles.detailTimer}>
              <Clock size={14} /> Ends in {item.endsIn}
            </span>
          </div>
        </div>

        <div style={styles.detailBody}>
          <h2 style={styles.detailTitle}>{item.title}</h2>
          <div style={styles.detailMetaRow}>
            <span style={styles.detailHouse}>
              <Gavel size={12} /> {item.auctionHouse}
            </span>
            <span style={styles.detailLocation}>
              <MapPin size={12} /> {item.location}
            </span>
          </div>

          <div style={styles.warningBadges}>
            {item.pickupOnly && (
              <div style={styles.warningBadge}>
                <Package size={14} style={{ color: 'var(--color-warning-600)' }} />
                <div>
                  <span style={styles.warningTitle}>Pickup Only</span>
                  <span style={styles.warningDesc}>Shipping not available</span>
                </div>
              </div>
            )}
            {item.scoutNeeded && (
              <div style={styles.warningBadgeGreen}>
                <Users size={14} style={{ color: 'var(--color-success-600)' }} />
                <div>
                  <span style={styles.warningTitle}>Local Scout Recommended</span>
                  <span style={styles.warningDesc}>{item.scoutsInterested} scouts available nearby</span>
                </div>
              </div>
            )}
            {item.endingSoon && (
              <div style={styles.warningBadgeRed}>
                <AlertTriangle size={14} style={{ color: 'var(--color-error-600)' }} />
                <div>
                  <span style={styles.warningTitle}>Ends Soon</span>
                  <span style={styles.warningDesc}>Less than 5 hours remaining</span>
                </div>
              </div>
            )}
            {item.highDemand && (
              <div style={styles.warningBadgeBlue}>
                <TrendingUp size={14} style={{ color: 'var(--color-primary-600)' }} />
                <div>
                  <span style={styles.warningTitle}>High Demand</span>
                  <span style={styles.warningDesc}>{item.scoutsInterested} users watching</span>
                </div>
              </div>
            )}
          </div>

          <div style={styles.detailPricing}>
            <div style={styles.detailPriceCard}>
              <span style={styles.detailPriceLabel}>Current Bid</span>
              <span style={styles.detailPriceAmount}>{item.currentBid}</span>
            </div>
            <div style={styles.detailPriceCard}>
              <span style={styles.detailPriceLabel}>Est. Value</span>
              <span style={styles.detailEstAmount}>{item.estimatedValue}</span>
            </div>
          </div>

          <div style={styles.detailSection}>
            <h3 style={styles.detailSectionTitle}>Suggested Max Bid</h3>
            <div style={styles.suggestedBid}>
              <DollarSign size={16} style={{ color: 'var(--color-success-600)' }} />
              <span style={styles.suggestedAmount}>$650</span>
              <span style={styles.suggestedNote}>Based on resale value and market trends</span>
            </div>
          </div>

          <div style={styles.detailSection}>
            <h3 style={styles.detailSectionTitle}>Estimated Resale Value</h3>
            <div style={styles.resaleCard}>
              <div style={styles.resaleRow}>
                <span style={styles.resaleLabel}>Quick Flip</span>
                <span style={styles.resaleValue}>{item.estimatedValue.split(' - ')[0]}</span>
              </div>
              <div style={styles.resaleRow}>
                <span style={styles.resaleLabel}>Hold 6 months</span>
                <span style={styles.resaleValue}>{item.estimatedValue.split(' - ')[1] || item.estimatedValue}</span>
              </div>
              <div style={styles.resaleRow}>
                <span style={styles.resaleLabel}>Potential Profit</span>
                <span style={styles.profitValue}>+$400 - $800</span>
              </div>
            </div>
          </div>

          <div style={styles.detailSection}>
            <h3 style={styles.detailSectionTitle}>Bid History</h3>
            <div style={styles.bidHistory}>
              <div style={styles.bidRow}>
                <span style={styles.bidUser}>@collector_42</span>
                <span style={styles.bidAmount}>{item.currentBid}</span>
                <span style={styles.bidTime}>12 min ago</span>
              </div>
              <div style={styles.bidRow}>
                <span style={styles.bidUser}>@vintage_eye</span>
                <span style={styles.bidAmount}>$350</span>
                <span style={styles.bidTime}>1h ago</span>
              </div>
              <div style={styles.bidRow}>
                <span style={styles.bidUser}>@picker_pro</span>
                <span style={styles.bidAmount}>$280</span>
                <span style={styles.bidTime}>3h ago</span>
              </div>
            </div>
          </div>

          <div style={styles.detailSection}>
            <h3 style={styles.detailSectionTitle}>Scout Activity</h3>
            <div style={styles.scoutActivity}>
              <div style={styles.scoutActivityRow}>
                <div style={styles.scoutDot} />
                <span style={styles.scoutActivityText}>
                  @dallas_picker viewed this listing (20 min ago)
                </span>
              </div>
              <div style={styles.scoutActivityRow}>
                <div style={styles.scoutDot} />
                <span style={styles.scoutActivityText}>
                  @phx_treasure offered to scout (1h ago)
                </span>
              </div>
            </div>
          </div>

          <button onClick={onCoordinate} style={styles.recruitBtn}>
            <Users size={18} style={{ color: 'var(--color-neutral-0)' }} />
            <span style={styles.recruitBtnText}>Recruit Scout</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoutCoordination({
  item,
  onBack,
}: {
  item: AuctionItem;
  onBack: () => void;
}) {
  return (
    <div style={styles.container}>
      <header style={styles.stepHeader}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <span style={styles.stepLabel}>Scout Coordination</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={styles.coordContent}>
        <div style={styles.coordItemCard}>
          <img src={item.image} alt={item.title} style={styles.coordImage} />
          <div style={styles.coordItemInfo}>
            <h3 style={styles.coordItemTitle}>{item.title}</h3>
            <span style={styles.coordItemLocation}>
              <MapPin size={11} /> {item.location}
            </span>
            <span style={styles.coordItemTimer}>
              <Clock size={11} /> Ends in {item.endsIn}
            </span>
          </div>
        </div>

        <div style={styles.coordSection}>
          <h3 style={styles.coordSectionTitle}>What do you need?</h3>
          <div style={styles.needsGrid}>
            <button style={styles.needBtn}>
              <Gavel size={16} style={{ color: 'var(--color-primary-600)' }} />
              <span style={styles.needLabel}>Bidding Help</span>
              <span style={styles.needDesc}>Local bidder to attend</span>
            </button>
            <button style={styles.needBtn}>
              <Package size={16} style={{ color: 'var(--color-secondary-600)' }} />
              <span style={styles.needLabel}>Pickup Assist</span>
              <span style={styles.needDesc}>Transport after winning</span>
            </button>
            <button style={styles.needBtn}>
              <Eye size={16} style={{ color: 'var(--color-accent-500)' }} />
              <span style={styles.needLabel}>Inspection</span>
              <span style={styles.needDesc}>Preview item in-person</span>
            </button>
          </div>
        </div>

        <div style={styles.coordSection}>
          <div style={styles.sectionRow}>
            <h3 style={styles.coordSectionTitle}>Available Scouts Near {item.location}</h3>
          </div>
          <div style={styles.scoutList}>
            {regionalScouts.map((scout, index) => (
              <div
                key={scout.id}
                style={{ ...styles.scoutCard, animationDelay: `${index * 80}ms` }}
              >
                <div style={styles.scoutCardTop}>
                  <div style={styles.scoutAvatar}>
                    <User size={18} style={{ color: 'var(--color-neutral-400)' }} />
                  </div>
                  <div style={styles.scoutCardInfo}>
                    <div style={styles.scoutNameRow}>
                      <span style={styles.scoutUsername}>@{scout.username}</span>
                      {scout.available ? (
                        <span style={styles.availableBadge}>Available</span>
                      ) : (
                        <span style={styles.busyBadge}>Busy</span>
                      )}
                    </div>
                    <div style={styles.scoutDetails}>
                      <span style={styles.scoutRating}>
                        <Star size={10} style={{ color: 'var(--color-primary-500)', fill: 'var(--color-primary-500)' }} />
                        {scout.rating}
                      </span>
                      <span style={styles.scoutRegion}>
                        <MapPin size={10} /> {scout.region}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={styles.scoutCardMeta}>
                  <div style={styles.scoutSpecialties}>
                    {scout.specialties.map((s) => (
                      <span key={s} style={styles.specTag}>{s}</span>
                    ))}
                  </div>
                  <div style={styles.scoutStats}>
                    <span style={styles.scoutStat}>{scout.completedJobs} jobs</span>
                    <span style={styles.scoutStat}>
                      <Clock size={10} /> {scout.responseTime}
                    </span>
                  </div>
                </div>

                <button
                  style={{
                    ...styles.requestHelpBtn,
                    ...(scout.available ? {} : styles.requestHelpBtnDisabled),
                  }}
                  disabled={!scout.available}
                >
                  {scout.available ? 'Request Help' : 'Unavailable'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-0)',
  },
  header: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  title: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  subtitle: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    marginTop: '1px',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
  },
  urgentBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-error-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-error-100)',
    marginBottom: 'var(--space-4)',
  },
  urgentText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-error-700)',
  },
  categoriesScroll: {
    display: 'flex',
    gap: 'var(--space-2)',
    overflow: 'auto',
    paddingBottom: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
  },
  catChip: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    border: '1px solid transparent',
  },
  catChipActive: {
    backgroundColor: 'var(--color-neutral-900)',
    color: 'var(--color-neutral-0)',
  },
  sectionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  count: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  auctionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },

  // Auction card
  card: {
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-sm)',
    animation: 'slideUp 0.4s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
    cursor: 'pointer',
  },
  cardImageWrap: {
    position: 'relative',
    aspectRatio: '16/9',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  cardBadges: {
    position: 'absolute',
    top: 'var(--space-2)',
    left: 'var(--space-2)',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  badgeEnding: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '3px 8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-error-500)',
    color: 'var(--color-neutral-0)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
  },
  badgePickup: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '3px 8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-warning-500)',
    color: 'var(--color-neutral-0)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
  },
  badgeScout: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '3px 8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-secondary-500)',
    color: 'var(--color-neutral-0)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
  },
  badgeHot: {
    position: 'absolute',
    top: 'var(--space-2)',
    right: 'var(--space-2)',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '3px 8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: 'var(--color-primary-400)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
  },
  cardBody: {
    padding: 'var(--space-3) var(--space-4) var(--space-4)',
  },
  cardTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
    lineHeight: 'var(--line-height-tight)',
    marginBottom: 'var(--space-2)',
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },
  cardHouse: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  cardLocation: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  cardPricing: {
    display: 'flex',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-sm)',
  },
  priceCol: {
    display: 'flex',
    flexDirection: 'column',
  },
  priceLabel: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-400)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  priceValue: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  estValue: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-success-600)',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardFooterLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  timerBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-error-600)',
  },
  scoutInterest: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  watchBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-500)',
  },
  requestScoutBtn: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)',
  },

  // Step header
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  backBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-600)',
  },
  stepLabel: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },

  // Detail view
  detailContent: {
    flex: 1,
    overflow: 'auto',
  },
  detailImageWrap: {
    position: 'relative',
    aspectRatio: '16/10',
    overflow: 'hidden',
  },
  detailImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  detailImageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 'var(--space-3) var(--space-4)',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  detailTimer: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: 'var(--space-1) var(--space-3)',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 'var(--radius-full)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    backdropFilter: 'blur(4px)',
  },
  detailBody: {
    padding: 'var(--space-4)',
  },
  detailTitle: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    lineHeight: 'var(--line-height-tight)',
    marginBottom: 'var(--space-2)',
  },
  detailMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
  },
  detailHouse: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  detailLocation: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },

  // Warning badges
  warningBadges: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-4)',
  },
  warningBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-warning-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-warning-100)',
  },
  warningBadgeGreen: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-success-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-success-100)',
  },
  warningBadgeRed: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-error-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-error-100)',
  },
  warningBadgeBlue: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-primary-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-primary-100)',
  },
  warningTitle: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    display: 'block',
  },
  warningDesc: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    display: 'block',
  },

  // Detail pricing
  detailPricing: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-5)',
  },
  detailPriceCard: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    textAlign: 'center',
  },
  detailPriceLabel: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-400)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'block',
    marginBottom: '4px',
  },
  detailPriceAmount: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  detailEstAmount: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-success-600)',
  },

  // Detail sections
  detailSection: {
    marginBottom: 'var(--space-5)',
  },
  detailSectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    marginBottom: 'var(--space-3)',
  },
  suggestedBid: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-success-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-success-100)',
    flexWrap: 'wrap',
  },
  suggestedAmount: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-success-700)',
  },
  suggestedNote: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-success-600)',
    width: '100%',
    marginTop: '2px',
  },
  resaleCard: {
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  resaleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resaleLabel: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
  },
  resaleValue: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  profitValue: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-success-600)',
  },
  bidHistory: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  bidRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-sm)',
  },
  bidUser: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  bidAmount: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  bidTime: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  scoutActivity: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  scoutActivityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  scoutDot: {
    width: '6px',
    height: '6px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success-400)',
    flexShrink: 0,
  },
  scoutActivityText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
  },
  recruitBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)',
    marginTop: 'var(--space-4)',
  },
  recruitBtnText: {
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
  },

  // Coordination view
  coordContent: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
  },
  coordItemCard: {
    display: 'flex',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    marginBottom: 'var(--space-5)',
  },
  coordImage: {
    width: '56px',
    height: '56px',
    borderRadius: 'var(--radius-sm)',
    objectFit: 'cover',
    flexShrink: 0,
  },
  coordItemInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  coordItemTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  coordItemLocation: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  coordItemTimer: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-error-600)',
    fontWeight: 'var(--font-weight-medium)',
  },
  coordSection: {
    marginBottom: 'var(--space-5)',
  },
  coordSectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    marginBottom: 'var(--space-3)',
  },
  needsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  needBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    textAlign: 'left',
    flexWrap: 'wrap',
  },
  needLabel: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    flex: 1,
  },
  needDesc: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
    width: '100%',
    marginLeft: '36px',
  },
  scoutList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  scoutCard: {
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    backgroundColor: 'var(--color-neutral-0)',
    boxShadow: 'var(--shadow-sm)',
    animation: 'slideUp 0.4s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  scoutCardTop: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },
  scoutAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scoutCardInfo: {
    flex: 1,
  },
  scoutNameRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '2px',
  },
  scoutUsername: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  availableBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success-50)',
    color: 'var(--color-success-700)',
  },
  busyBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-500)',
  },
  scoutDetails: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  scoutRating: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  scoutRegion: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  scoutCardMeta: {
    marginBottom: 'var(--space-3)',
  },
  scoutSpecialties: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },
  specTag: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
  },
  scoutStats: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  scoutStat: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  requestHelpBtn: {
    width: '100%',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)',
    textAlign: 'center',
  },
  requestHelpBtnDisabled: {
    background: 'var(--color-neutral-200)',
    color: 'var(--color-neutral-400)',
  },
};
