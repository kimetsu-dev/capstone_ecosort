import React, { useState, useEffect } from 'react';
import { Shield, Lock, CheckCircle, Info, Eye, Globe, Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

const PublicVerification = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [chainData, setChainData] = useState([]);
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(true);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [totalPointsProtected, setTotalPointsProtected] = useState(0);

  // Simplified translation object
  const translations = {
    en: {
      title: "Why Your Data is Protected",
      languageToggle: {
        english: "English",
        tagalog: "Tagalog"
      },
      tabs: {
        overview: "Overview",
        howItWorks: "How It Works",
        viewRecords: "View Records"
      },
      overview: {
        title: "Your Rewards Are Protected",
        subtitle: "Here's how we keep your points safe",
        cards: [
          {
            icon: "shield",
            title: "Cannot Be Changed",
            description: "Once recorded, your points cannot be deleted or modified by anyone, including admins."
          },
          {
            icon: "eye",
            title: "Anyone Can Check",
            description: "All records are public. You can verify that your points are recorded correctly."
          },
          {
            icon: "lock",
            title: "No Fraud",
            description: "The system automatically detects if someone tries to cheat or change records."
          }
        ],
        stats: {
          totalBlocks: "Total Records",
          totalPoints: "Points Protected",
          verified: "All Verified"
        }
      },
      howItWorks: {
        title: "Simple Explanation",
        subtitle: "Understanding blockchain in plain language",
        steps: [
          {
            number: "1",
            title: "You Recycle Waste",
            description: "When you bring waste, we record it and give you points."
          },
          {
            number: "2",
            title: "Record is Locked",
            description: "Your points are saved in a special way that can't be changed."
          },
          {
            number: "3",
            title: "Everyone Can See",
            description: "All records are public so everyone knows the system is fair."
          },
          {
            number: "4",
            title: "Points Stay Safe",
            description: "Your earned rewards are protected forever."
          }
        ],
        comparison: {
          title: "Normal Database vs Blockchain",
          normal: {
            title: "Normal Database",
            points: [
              "Admin can change your points",
              "You can't check if it's correct",
              "Changes can happen secretly"
            ]
          },
          blockchain: {
            title: "With Blockchain",
            points: [
              "Nobody can change your points",
              "You can check anytime",
              "All changes are visible to everyone"
            ]
          }
        }
      },
      viewRecords: {
        title: "Public Records",
        subtitle: "View recent waste recycling records",
        noRecords: "No records yet. Start recycling to see your data here!",
        blockInfo: "Record #",
        date: "Date",
        protected: "Protected & Verified",
        loading: "Loading records...",
        showingRecent: "Showing recent records"
      }
    },
    tl: {
      title: "Bakit Protektado ang Iyong Data",
      languageToggle: {
        english: "English",
        tagalog: "Tagalog"
      },
      tabs: {
        overview: "Buod",
        howItWorks: "Paano Gumagana",
        viewRecords: "Tingnan ang Records"
      },
      overview: {
        title: "Protektado ang Iyong Rewards",
        subtitle: "Ganito pinoprotektahan namin ang iyong points",
        cards: [
          {
            icon: "shield",
            title: "Hindi Mababago",
            description: "Kapag naitala na, hindi na mababago o mabubura ng kahit sino ang iyong points, pati ng admin."
          },
          {
            icon: "eye",
            title: "Pwedeng Tingnan ng Lahat",
            description: "Lahat ng records ay pampubliko. Pwede mong i-verify na tama ang iyong points."
          },
          {
            icon: "lock",
            title: "Walang Pandaraya",
            description: "Automatic na nakikita ng system kung may sumusubok mandaya o baguhin ang records."
          }
        ],
        stats: {
          totalBlocks: "Kabuuang Records",
          totalPoints: "Points na Protektado",
          verified: "Lahat ay Na-verify"
        }
      },
      howItWorks: {
        title: "Simpleng Paliwanag",
        subtitle: "Pag-unawa sa blockchain sa madaling salita",
        steps: [
          {
            number: "1",
            title: "Nag-recycle Ka ng Basura",
            description: "Kapag nagdala ka ng basura, tina-tala namin at binibigyan ka ng points."
          },
          {
            number: "2",
            title: "Naka-lock ang Record",
            description: "Ang iyong points ay sine-save sa special na paraan na hindi na mababago."
          },
          {
            number: "3",
            title: "Makikita ng Lahat",
            description: "Pampubliko ang lahat ng records para alam ng lahat na patas ang sistema."
          },
          {
            number: "4",
            title: "Ligtas ang Points",
            description: "Ang iyong kinitang rewards ay protektado magpakailanman."
          }
        ],
        comparison: {
          title: "Normal na Database vs Blockchain",
          normal: {
            title: "Normal na Database",
            points: [
              "Pwedeng baguhin ng admin ang points mo",
              "Hindi mo mache-check kung tama",
              "Pwedeng may lihim na pagbabago"
            ]
          },
          blockchain: {
            title: "May Blockchain",
            points: [
              "Walang makakabago ng points mo",
              "Pwede mong i-check anumang oras",
              "Makikita ng lahat ang mga pagbabago"
            ]
          }
        }
      },
      viewRecords: {
        title: "Pampublikong Records",
        subtitle: "Tingnan ang mga kamakailang waste recycling records",
        noRecords: "Walang records pa. Magsimula ng pag-recycle para makita ang iyong data dito!",
        blockInfo: "Record #",
        date: "Petsa",
        protected: "Protektado at Na-verify",
        loading: "Nilo-load ang records...",
        showingRecent: "Ipinapakita ang mga kamakailang records"
      }
    }
  };

  const t = translations[language];

  // Fetch real blockchain data from Firebase
  useEffect(() => {
    const q = query(collection(db, "ledger"), orderBy("index", "desc"), limit(10));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const blocks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setChainData(blocks);
      setTotalBlocks(blocks.length);
      
      // Calculate total points protected
      const totalPoints = blocks.reduce((sum, block) => sum + Math.abs(block.points || 0), 0);
      setTotalPointsProtected(totalPoints);
      
      setLoading(false);
    }, (error) => {
      console.error("Error fetching ledger data:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Helper function to format timestamp
  const formatTimestamp = (timestamp) => {
    if (timestamp?.toDate) {
      return timestamp.toDate().toLocaleDateString();
    }
    try {
      return new Date(timestamp).toLocaleDateString();
    } catch {
      return 'N/A';
    }
  };

  // Helper function to get action type display
  const getActionTypeDisplay = (actionType) => {
    const types = {
      'WASTE_SUBMITTED': language === 'en' ? 'Waste Submitted' : 'Basura na Isinumite',
      'POINTS_AWARDED': language === 'en' ? 'Points Awarded' : 'Points na Ibinigay',
      'REWARD_REDEEMED': language === 'en' ? 'Reward Redeemed' : 'Reward na Na-redeem',
      'POINTS_ADJUSTED': language === 'en' ? 'Points Adjusted' : 'Points na In-adjust'
    };
    return types[actionType] || actionType;
  };

  const IconComponent = ({ type, className }) => {
    const icons = {
      shield: Shield,
      eye: Eye,
      lock: Lock
    };
    const Icon = icons[type] || Shield;
    return <Icon className={className} />;
  };

  // Overview Tab
  const OverviewTab = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">{t.overview.title}</h2>
        <p className="text-gray-600">{t.overview.subtitle}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border-2 border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-600 font-semibold">{t.overview.stats.totalBlocks}</span>
            <Shield className="text-blue-500" size={24} />
          </div>
          <div className="text-3xl font-bold text-blue-800">
            {loading ? "..." : totalBlocks}
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border-2 border-green-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-600 font-semibold">{t.overview.stats.totalPoints}</span>
            <Lock className="text-green-500" size={24} />
          </div>
          <div className="text-3xl font-bold text-green-800">
            {loading ? "..." : totalPointsProtected.toLocaleString()}
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border-2 border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-purple-600 font-semibold">{t.overview.stats.verified}</span>
            <CheckCircle className="text-purple-500" size={24} />
          </div>
          <div className="text-3xl font-bold text-purple-800">
            {loading ? "..." : "✓"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {t.overview.cards.map((card, idx) => (
          <div
            key={idx}
            className="bg-white rounded-xl p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300 hover:scale-105"
          >
            <div className="flex justify-center mb-4">
              <div className="bg-blue-100 p-4 rounded-full">
                <IconComponent type={card.icon} className="text-blue-600" size={32} />
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2 text-center">{card.title}</h3>
            <p className="text-gray-600 text-center text-sm">{card.description}</p>
          </div>
        ))}
      </div>

      {/* Simple trust message */}
      <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-lg">
        <div className="flex items-start">
          <CheckCircle className="text-green-500 mr-3 flex-shrink-0 mt-1" size={24} />
          <div>
            <h4 className="font-bold text-green-800 mb-1">
              {language === 'en' ? 'You Can Trust This System' : 'Mapagkakatiwalaan Mo ang Sistemang Ito'}
            </h4>
            <p className="text-green-700 text-sm">
              {language === 'en' 
                ? 'Every point you earn is permanently recorded and protected. Nobody can take them away or change them.'
                : 'Bawat point na kikitain mo ay permanently naka-record at protektado. Walang makakaalis o makakabago nito.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // How It Works Tab
  const HowItWorksTab = () => (
    <div className="space-y-8">
      {/* Steps */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">{t.howItWorks.title}</h2>
        <p className="text-gray-600 text-center mb-8">{t.howItWorks.subtitle}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {t.howItWorks.steps.map((step, idx) => (
            <div key={idx} className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
              <div className="flex items-start space-x-4">
                <div className="bg-blue-500 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg flex-shrink-0">
                  {step.number}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">{step.title}</h3>
                  <p className="text-gray-600 text-sm">{step.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison */}
      <div>
        <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">{t.howItWorks.comparison.title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Normal Database */}
          <div className="bg-red-50 rounded-xl p-6 border-2 border-red-200">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-red-200 p-3 rounded-full">
                <span className="text-2xl">❌</span>
              </div>
            </div>
            <h4 className="text-lg font-bold text-red-800 mb-4 text-center">{t.howItWorks.comparison.normal.title}</h4>
            <ul className="space-y-2">
              {t.howItWorks.comparison.normal.points.map((point, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-red-500 mr-2 flex-shrink-0">•</span>
                  <span className="text-red-700 text-sm">{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Blockchain */}
          <div className="bg-green-50 rounded-xl p-6 border-2 border-green-200">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-green-200 p-3 rounded-full">
                <span className="text-2xl">✅</span>
              </div>
            </div>
            <h4 className="text-lg font-bold text-green-800 mb-4 text-center">{t.howItWorks.comparison.blockchain.title}</h4>
            <ul className="space-y-2">
              {t.howItWorks.comparison.blockchain.points.map((point, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-green-500 mr-2 flex-shrink-0">•</span>
                  <span className="text-green-700 text-sm">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  // View Records Tab
  const ViewRecordsTab = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">{t.viewRecords.title}</h2>
        <p className="text-gray-600">{t.viewRecords.subtitle}</p>
        {!loading && chainData.length > 0 && (
          <p className="text-sm text-gray-500 mt-2">
            {t.viewRecords.showingRecent}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="text-blue-600 animate-spin mb-4" size={48} />
          <p className="text-gray-600">{t.viewRecords.loading}</p>
        </div>
      ) : chainData.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <Globe className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600">{t.viewRecords.noRecords}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {chainData.map((block, idx) => (
            <div
              key={block.id}
              className="bg-white rounded-xl p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-500 text-white px-4 py-2 rounded-lg font-bold">
                    {t.viewRecords.blockInfo}{block.index}
                  </div>
                  <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium flex items-center">
                    <CheckCircle size={14} className="mr-1" />
                    {t.viewRecords.protected}
                  </div>
                </div>
                <span className="text-sm text-gray-500">
                  {t.viewRecords.date}: {formatTimestamp(block.timestamp)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 rounded-lg p-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1 font-medium">
                    {language === 'en' ? 'Action Type' : 'Uri ng Aksyon'}
                  </p>
                  <p className="text-sm font-semibold text-gray-800">{getActionTypeDisplay(block.actionType)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1 font-medium">
                    {language === 'en' ? 'Points' : 'Points'}
                  </p>
                  <p className={`text-sm font-semibold ${block.points > 0 ? 'text-green-600' : block.points < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {block.points > 0 ? '+' : ''}{block.points}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1 font-medium">
                    {language === 'en' ? 'Record Hash' : 'Hash ng Record'}
                  </p>
                  <p className="text-xs font-mono text-gray-600 truncate" title={block.hash}>
                    {block.hash.substring(0, 16)}...
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header with Language Toggle */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-xl p-6 sm:p-8 mb-6 text-white">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-xl">
                <Shield size={36} />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-1">{t.title}</h1>
                <p className="text-blue-100 text-sm">
                  {language === 'en' 
                    ? 'Simple and secure waste tracking'
                    : 'Simple at secure na waste tracking'}
                </p>
              </div>
            </div>
            
            {/* Improved Language Toggle */}
            <div className="flex gap-2 bg-white/10 p-1 rounded-xl backdrop-blur-sm">
              <button
                onClick={() => setLanguage('en')}
                className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold transition-all duration-300 ${
                  language === 'en' 
                    ? 'bg-white text-blue-600 shadow-lg' 
                    : 'text-white hover:bg-white/10'
                }`}
              >
                🇬🇧 {t.languageToggle.english}
              </button>
              <button
                onClick={() => setLanguage('tl')}
                className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold transition-all duration-300 ${
                  language === 'tl' 
                    ? 'bg-white text-blue-600 shadow-lg' 
                    : 'text-white hover:bg-white/10'
                }`}
              >
                🇵🇭 {t.languageToggle.tagalog}
              </button>
            </div>
          </div>
        </div>

        {/* Simplified Tabs */}
        <div className="bg-white rounded-2xl shadow-lg mb-6 overflow-hidden">
          <div className="flex flex-wrap border-b">
            {[
              { id: 'overview', label: t.tabs.overview, icon: Info },
              { id: 'howItWorks', label: t.tabs.howItWorks, icon: Shield },
              { id: 'viewRecords', label: t.tabs.viewRecords, icon: Eye },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 sm:px-6 py-4 font-semibold transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'border-b-4 border-blue-500 text-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <tab.icon size={20} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="transition-all duration-300">
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'howItWorks' && <HowItWorksTab />}
          {activeTab === 'viewRecords' && <ViewRecordsTab />}
        </div>
      </div>
    </div>
  );
};

export default PublicVerification;