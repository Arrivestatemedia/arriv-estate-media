import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { createPageUrl } from "../utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Check, Lock, Search, Loader2, Film } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BookingForm from "../components/booking/BookingForm";
import { packages, addOns, determinePricingTier, getTierLabel, getPackagePriceForTier, computeTotalForTier } from "@/lib/services";
import ArrivStudioTile from "@/components/studio/ArrivStudioTile";
import StudioCommerceSection from "@/components/studio/StudioCommerceSection";
import StudioCheckoutAddOns from "@/components/studio/StudioCheckoutAddOns";

function PackageCard({ pkg, isExpanded, onToggle, onSelect, isSelected, isLocked, displayPrice, isCustomQuote, tierLabel, propertyAddress, onAddressChange, onLookup, sqftLookingUp, propertySqft, sqftSource, sqftLookupError, showManualSqft, manualSqftInput, onManualSqftInput, onManualSqftSet, onResetSqft }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-[#1A1A1A]/10 last:border-b-0"
    >
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#B8956A]/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-[#1A1A1A]">{pkg.name}</span>
          {pkg.tag && (
            <span className="px-2 py-1 bg-[#B8956A] text-white text-xs rounded-full">
              {pkg.tag}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {isCustomQuote ? (
            <span className="text-lg font-bold text-[#B8956A] italic">Custom Quote</span>
          ) : (
            <span className="text-2xl font-bold text-[#B8956A]">${displayPrice ?? pkg.price}</span>
          )}
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 space-y-3">
              {pkg.features.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-2 text-[#1A1A1A]/70">
                  <span className="text-sm mt-0.5">•</span>
                  <span className="text-sm">{feature}</span>
                </div>
              ))}

              {/* Sqft-based pricing lookup tucked into each package */}
              <div className="mt-4 pt-4 border-t border-[#1A1A1A]/10">
                <p className="text-xs text-[#1A1A1A]/70 mb-3">
                  <strong>Includes properties up to 2,500 sq. ft.</strong> Enter the property address to see exact pricing for this package.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={propertyAddress}
                    onChange={(e) => onAddressChange(e.target.value)}
                    className="flex-1 px-3 py-2 border-2 border-[#B8956A]/30 rounded-lg focus:border-[#B8956A] focus:outline-none text-[#1A1A1A] text-sm"
                    placeholder="Enter your property address"
                  />
                  <Button
                    onClick={onLookup}
                    disabled={!propertyAddress.trim() || sqftLookingUp}
                    size="sm"
                    className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
                  >
                    {sqftLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span className="ml-1.5">Look Up</span>
                  </Button>
                </div>

                {propertySqft && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-[#B8956A]/10 border border-[#B8956A]/30 text-[#B8956A] text-xs font-medium">
                      {isCustomQuote ? "Custom Quote Required" : `Tier: ${tierLabel}`}
                    </span>
                    <span className="text-xs text-[#1A1A1A]/60">
                      {propertySqft.toLocaleString()} sq ft
                      {sqftSource === 'manual_customer' && ' (manual)'}
                    </span>
                    <button
                      onClick={onResetSqft}
                      className="text-xs text-[#B8956A] hover:underline"
                    >
                      Reset
                    </button>
                  </div>
                )}

                {sqftLookupError && (
                  <p className="text-xs text-red-600 mt-2">{sqftLookupError}</p>
                )}

                {showManualSqft && !propertySqft && (
                  <div className="mt-3">
                    <p className="text-xs text-[#1A1A1A]/60 mb-2">
                      Couldn't auto-detect. Enter sq ft manually:
                    </p>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        min="0"
                        value={manualSqftInput}
                        onChange={(e) => onManualSqftInput(e.target.value)}
                        className="w-40 px-3 py-2 border-2 border-[#B8956A]/30 rounded-lg focus:border-[#B8956A] focus:outline-none text-[#1A1A1A] text-sm"
                        placeholder="Square footage"
                      />
                      <Button
                        onClick={onManualSqftSet}
                        disabled={!manualSqftInput || parseInt(manualSqftInput, 10) <= 0}
                        size="sm"
                        className="bg-[#B8956A] hover:bg-[#A68559] text-white"
                      >
                        Set
                      </Button>
                    </div>
                  </div>
                )}

                {isCustomQuote && (
                  <p className="text-xs text-[#1A1A1A]/60 italic mt-2">
                    Properties over 10,000 sq ft require a custom quote. Call 678-242-9107 or add a note in your booking.
                  </p>
                )}
              </div>

              {isLocked ? (
                <div className="w-full mt-4 flex items-center justify-center gap-2 py-2 rounded-md bg-[#B8956A]/10 border border-[#B8956A]/40 text-[#B8956A] text-sm font-medium">
                  <Lock className="w-4 h-4" /> Selected by your sales rep
                </div>
              ) : (
                <Button
                  onClick={() => onSelect(pkg)}
                  variant={isSelected ? "outline" : "default"}
                  className={isSelected ? "w-full border-red-300 text-red-600 hover:bg-red-50 mt-4" : "w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white mt-4"}
                >
                  {isSelected ? "Remove from Cart" : "Select Package"}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function BookingPage() {
  const [expandedPackage, setExpandedPackage] = useState(null);
  const [expandedAddOns, setExpandedAddOns] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [cartAddOns, setCartAddOns] = useState([]);
  const [editingBooking, setEditingBooking] = useState(null);
  const [requestPayAtClosing, setRequestPayAtClosing] = useState(false);
  const [showPayAtClosingDialog, setShowPayAtClosingDialog] = useState(false);
  const [lockedInvite, setLockedInvite] = useState(null);
  const [salesReps, setSalesReps] = useState([]);
  const [propertyAddress, setPropertyAddress] = useState("");
  const [propertySqft, setPropertySqft] = useState(null);
  const [sqftSource, setSqftSource] = useState(null);
  const [sqftLookingUp, setSqftLookingUp] = useState(false);
  const [sqftLookupError, setSqftLookupError] = useState(null);
  const [showManualSqft, setShowManualSqft] = useState(false);
  const [manualSqftInput, setManualSqftInput] = useState("");
  const [payAtClosingEnabled, setPayAtClosingEnabled] = useState(false);
  const [displayPricing, setDisplayPricing] = useState(null);
  const [studioSubscription, setStudioSubscription] = useState(null);
  const [studioAddOns, setStudioAddOns] = useState([]);
  const [studioBundle, setStudioBundle] = useState(null);

  // Load the org-wide pay-at-closing toggle (default OFF). The backend logic
  // stays intact; this only gates the client-facing UI.
  useEffect(() => {
    base44.entities.AppSetting.filter({ key: "pay_at_closing_enabled" })
      .then(rows => {
        if (rows && rows.length > 0) setPayAtClosingEnabled(rows[0].value === "true");
      })
      .catch(() => {});
  }, []);

  // Fetch the customer's tenure-adjusted display prices so the already-adjusted
  // price is shown everywhere package pricing is displayed — never a surprise
  // surcharge at checkout. Falls back to canonical prices if the call fails.
  useEffect(() => {
    const clientEmail = localStorage.getItem('user_email') || sessionStorage.getItem('user_email') || '';
    base44.functions.invoke('getCustomerDisplayPricing', { client_email: clientEmail, property_sqft: null })
      .then(res => {
        const data = res?.data;
        if (data?.success) setDisplayPricing(data);
      })
      .catch(() => {});
    // Fetch active Arriv Studio subscription (if any) for the tile display.
    base44.functions.invoke('manageStudioSubscription', { action: 'get' })
      .then(res => {
        const data = res?.data;
        if (data?.success && data?.subscription) setStudioSubscription(data.subscription);
      })
      .catch(() => {});
  }, []);

  const pricingTier = determinePricingTier(propertySqft);
  const isCustomQuote = pricingTier === "CUSTOM";
  const tierLabel = getTierLabel(pricingTier);

  const handleLookupSqft = async () => {
    if (!propertyAddress.trim()) return;
    setSqftLookingUp(true);
    setSqftLookupError(null);
    try {
      const res = await base44.functions.invoke('lookupPropertySqft', { address: propertyAddress, lookup_by: 'client_booking' });
      const result = res?.data?.property || res?.property;
      if (result?.property_sqft) {
        setPropertySqft(result.property_sqft);
        setSqftSource(result.property_sqft_source || 'provider');
        setShowManualSqft(false);
      } else {
        setShowManualSqft(true);
        setSqftSource(null);
      }
    } catch (err) {
      setSqftLookupError('Could not look up property. Enter sq ft manually.');
      setShowManualSqft(true);
    } finally {
      setSqftLookingUp(false);
    }
  };

  const handleManualSqftSet = () => {
    const val = parseInt(manualSqftInput, 10);
    if (val > 0) {
      setPropertySqft(val);
      setSqftSource('manual_customer');
    }
  };

  const handleResetSqft = () => {
    setPropertySqft(null);
    setManualSqftInput("");
    setShowManualSqft(false);
    setSqftSource(null);
    setSqftLookupError(null);
  };

  useEffect(() => {
    base44.functions.invoke('listSalesReps', {}).then(res => setSalesReps(res?.data?.reps || [])).catch(() => {});

    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('booking_id');
    if (bookingId) {
      base44.entities.Booking.get(bookingId).then(booking => {
        setEditingBooking(booking);
        setShowBookingForm(true);
      }).catch(err => {
        console.error('Failed to load booking:', err);
        window.location.href = createPageUrl('ClientBookings');
      });
      return;
    }

    const inviteToken = urlParams.get('invite') || localStorage.getItem('pending_invite_token');
    if (inviteToken) {
      base44.functions.invoke('getSignupInvite', { token: inviteToken }).then(res => {
        const inv = res?.data;
        if (inv && inv.package) {
          const pkg = packages.find(p => p.id === inv.package);
          const lockedAddOnObjs = (inv.locked_add_ons || [])
            .map(id => addOns.find(a => a.id === id))
            .filter(Boolean);
          if (pkg) setSelectedPackage(pkg);
          if (lockedAddOnObjs.length) setCartAddOns(lockedAddOnObjs);
          setLockedInvite({ ...inv, token: inviteToken });
        }
      }).catch(err => console.error('Failed to load invite:', err));
    }
  }, []);

  const createBookingMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke('handleBookingSubmission', { booking: data }),
    onSuccess: () => {
      localStorage.removeItem('pending_invite_token');
      localStorage.removeItem('selected_sales_member_id');
      localStorage.removeItem('selected_sales_member_name');
      setShowBookingForm(false);
      setSelectedPackage(null);
      window.location.href = createPageUrl('ClientBookings');
    },
  });

  const requestChangesMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke('requestBookingChange', data),
    onSuccess: () => {
      setShowBookingForm(false);
      setEditingBooking(null);
      window.location.href = createPageUrl('ClientBookings');
    },
    onError: (error) => {
      console.error('Change request failed:', error);
      alert('Failed to submit change request: ' + (error?.message || 'Unknown error'));
    },
  });

  const handleSelectPackage = (pkg) => {
    if (lockedInvite && lockedInvite.package === pkg.id) return;
    if (selectedPackage?.id === pkg.id) {
      setSelectedPackage(null);
    } else {
      setSelectedPackage(pkg);
    }
  };

  const handleAddToCart = (addon) => {
    if (!cartAddOns.find(a => a.id === addon.id)) {
      setCartAddOns([...cartAddOns, addon]);
    }
  };

  const handleRemoveFromCart = (addonId) => {
    if (lockedInvite && (lockedInvite.locked_add_ons || []).includes(addonId)) return;
    setCartAddOns(cartAddOns.filter(a => a.id !== addonId));
  };

  const handleAddStudioAddOn = (addon) => {
    if (!studioAddOns.find(a => a.id === addon.id)) {
      setStudioAddOns([...studioAddOns, addon]);
    }
  };

  const handleRemoveStudioAddOn = (addonId) => {
    setStudioAddOns(studioAddOns.filter(a => a.id !== addonId));
  };

  const handleSelectStudioBundle = (plan) => setStudioBundle(plan);
  const handleRemoveStudioBundle = () => setStudioBundle(null);

  // Use tenure-adjusted package price when available; fall back to tier/canonical price.
  const getAdjustedPackagePriceDollars = (pkgId) => {
    if (displayPricing?.adjusted_package_prices?.[pkgId] != null) {
      return displayPricing.adjusted_package_prices[pkgId] / 100;
    }
    return getPackagePriceForTier(pkgId, pricingTier) ?? packages.find(p => p.id === pkgId)?.price ?? 0;
  };

  const lifecycleAdjustmentDollars = displayPricing?.customer_tenure?.adjustment_dollars || 0;

  const tierPackagePrice = selectedPackage ? getAdjustedPackagePriceDollars(selectedPackage.id) : 0;
  const studioAddOnTotal = studioAddOns.reduce((sum, a) => sum + (a.price || 0), 0);
  const studioBundleTotal = studioBundle?.price || 0;
  const totalPrice = tierPackagePrice + cartAddOns.reduce((sum, a) => sum + a.price, 0) + studioAddOnTotal + studioBundleTotal;

  const handleSubmitBooking = async (bookingData) => {
    return new Promise((resolve) => {
      createBookingMutation.mutate({
        ...bookingData,
        request_pay_at_closing: requestPayAtClosing,
        studio_add_ons: studioAddOns.map(a => a.id),
        studio_bundle_plan: studioBundle?.id || null,
        ...(lockedInvite ? {
          sales_member_id: lockedInvite.sales_member_id,
          sales_member_name: lockedInvite.sales_member_name,
          locked_add_ons: lockedInvite.locked_add_ons,
          services_locked: true,
          invite_token: lockedInvite.token,
        } : {}),
      }, {
        onSettled: () => resolve(),
      });
    });
  };

  if (showBookingForm) {
    return (
      <BookingForm
      selectedPackage={selectedPackage}
      cartAddOns={cartAddOns}
      addOns={addOns}
      requestPayAtClosing={requestPayAtClosing}
      propertySqft={propertySqft}
      pricingTier={pricingTier}
      propertyAddress={propertyAddress}
      adjustedPackagePrice={selectedPackage ? getAdjustedPackagePriceDollars(selectedPackage.id) : null}
      lifecycleAdjustmentDollars={lifecycleAdjustmentDollars}
      onSubmit={editingBooking ? async (formData) => {
        return new Promise((resolve) => {
          requestChangesMutation.mutate({
            bookingId: editingBooking.id,
            changeRequest: formData
          }, {
            onSettled: () => resolve(),
          });
        });
      } : handleSubmitBooking}
        onCancel={() => {
          setShowBookingForm(false);
          setEditingBooking(null);
          window.location.href = createPageUrl('ClientBookings');
        }}
        isEditing={!!editingBooking}
        editingBooking={editingBooking}
        salesReps={salesReps}
        lockedSalesRepId={lockedInvite?.sales_member_id || null}
        lockedSalesRepName={lockedInvite?.sales_member_name || null}
        defaultSalesRepId={localStorage.getItem('selected_sales_member_id') || null}
      />
    );
  }

  return (
    <>
      <Dialog open={showPayAtClosingDialog} onOpenChange={setShowPayAtClosingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay-at-Closing Request Received</DialogTitle>
            <DialogDescription className="text-base pt-2">
              Someone will be in contact with you shortly to discuss your pay-at-closing options.
            </DialogDescription>
          </DialogHeader>
          <Button
            onClick={() => {
              setShowPayAtClosingDialog(false);
              setShowBookingForm(true);
            }}
            className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            Continue
          </Button>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen bg-[#FFFBF5]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {lockedInvite && (
          <div className="mb-6 rounded-lg border-2 border-[#B8956A]/40 bg-[#B8956A]/10 p-4">
            <p className="text-sm font-semibold text-[#B8956A]">
              {lockedInvite.sales_member_name ? `${lockedInvite.sales_member_name} selected your package.` : 'Your sales rep selected your package.'}
            </p>
            <p className="text-xs text-[#1A1A1A]/70 mt-1">
              You can add more services below, but to remove anything please contact your sales rep.
            </p>
          </div>
        )}
        <div className="text-center mb-12">
          {displayPricing?.customer_tenure && !displayPricing.customer_tenure.review_flag && lifecycleAdjustmentDollars > 0 && (
            <div className="mb-6 rounded-lg border border-[#B8956A]/30 bg-[#B8956A]/5 p-4 text-left">
              <p className="text-sm font-semibold text-[#B8956A]">
                Loyalty Pricing Active — {displayPricing.customer_tenure.band_label}
              </p>
              <p className="text-xs text-[#1A1A1A]/70 mt-1">
                As a returning customer, your package prices reflect your tenure with us
                (+${lifecycleAdjustmentDollars.toFixed(2)} per service). Add-on prices remain at standard rates.
              </p>
            </div>
          )}
          {displayPricing?.customer_tenure?.review_flag && (
            <div className="mb-6 rounded-lg border border-[#B8956A]/20 bg-white p-4 text-left">
              <p className="text-sm font-semibold text-[#1A1A1A]/80">
                Welcome{displayPricing.client_email ? ` back` : ''}!
              </p>
              <p className="text-xs text-[#1A1A1A]/60 mt-1">
                Standard pricing is shown below. Your account is being reviewed for loyalty pricing eligibility.
              </p>
            </div>
          )}
          <h1 className="text-4xl md:text-5xl font-bold text-[#1A1A1A] mb-4">
            TRANSPARENT PRICING FOR PROFESSIONAL REAL ESTATE MEDIA
          </h1>
          <p className="text-lg text-[#1A1A1A]/70 italic mb-8">
            Built specifically for listings that want media that just works.
          </p>

          <div className="space-y-4 text-left max-w-2xl mx-auto mb-8">
            <p className="text-[#1A1A1A]/80">
              We specialize in clean, unbranded MLS walkthrough videos that can be published
              immediately without compliance issues. Photos, 3D tours, and add-ons are layered in
              when they help the listing.
            </p>
            <p className="text-[#1A1A1A]/80">
              All shoots include editing, color correction, and MLS-ready delivery. Custom packages
              available.
            </p>
          </div>
        </div>

        <ArrivStudioTile
          subscription={studioSubscription}
          onManage={() => { window.location.href = createPageUrl("StudioWorkspace"); }}
        />

        <div className="bg-white rounded-lg shadow-lg border-2 border-[#B8956A]/20 overflow-hidden mb-8">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              isExpanded={expandedPackage === pkg.id}
              onToggle={() => setExpandedPackage(expandedPackage === pkg.id ? null : pkg.id)}
              onSelect={handleSelectPackage}
              isSelected={selectedPackage?.id === pkg.id}
              isLocked={lockedInvite?.package === pkg.id}
              displayPrice={getAdjustedPackagePriceDollars(pkg.id)}
              isCustomQuote={isCustomQuote}
              tierLabel={tierLabel}
              propertyAddress={propertyAddress}
              onAddressChange={setPropertyAddress}
              onLookup={handleLookupSqft}
              sqftLookingUp={sqftLookingUp}
              propertySqft={propertySqft}
              sqftSource={sqftSource}
              sqftLookupError={sqftLookupError}
              showManualSqft={showManualSqft}
              manualSqftInput={manualSqftInput}
              onManualSqftInput={setManualSqftInput}
              onManualSqftSet={handleManualSqftSet}
              onResetSqft={handleResetSqft}
            />
            ))}
            </div>

            <StudioCommerceSection />

            <StudioCheckoutAddOns
            selectedAddOns={studioAddOns}
            onAdd={handleAddStudioAddOn}
            onRemove={handleRemoveStudioAddOn}
            selectedBundle={studioBundle}
            onSelectBundle={handleSelectStudioBundle}
            onRemoveBundle={handleRemoveStudioBundle}
            />

            <div className="bg-white rounded-lg shadow-lg border-2 border-[#B8956A]/20 overflow-hidden mb-8">
            <button
            onClick={() => setExpandedAddOns(!expandedAddOns)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#B8956A]/5 transition-colors"
          >
            <span className="text-lg font-semibold text-[#1A1A1A]">
              Optional Add-Ons (can be added to any package)
            </span>
            {expandedAddOns ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>

          <AnimatePresence>
            {expandedAddOns && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-6 space-y-2">
                  {addOns.map((addon) => {
                    const isInCart = cartAddOns.find(a => a.id === addon.id);
                    const isLockedAddOn = lockedInvite && (lockedInvite.locked_add_ons || []).includes(addon.id);
                    
                    const requiresPackage = ['ai_staging', 'twilight', 'rush_delivery'].includes(addon.id);
                    const requiresPhotoPackage = ['twilight', 'ai_staging'].includes(addon.id);
                    
                    const hasPackage = !!selectedPackage;
                    const hasPhotoPackage = selectedPackage && ['photo_essentials', 'photo_cinematic', 'premium_bundle'].includes(selectedPackage.id);
                    
                    let isDisabled = false;
                    let disabledReason = "";
                    
                    if (requiresPackage && !hasPackage) {
                      isDisabled = true;
                      disabledReason = "Requires a package";
                    } else if (requiresPhotoPackage && !hasPhotoPackage) {
                      isDisabled = true;
                      disabledReason = "Requires Photo Essentials or above";
                    }
                    
                    return (
                      <div key={addon.id} className="flex items-center justify-between py-2 gap-4">
                        <div className="flex-1">
                          <span className={`text-sm ${isDisabled ? 'text-[#1A1A1A]/40' : 'text-[#1A1A1A]/70'}`}>
                            {addon.name}
                          </span>
                          {isDisabled && (
                            <p className="text-xs text-[#1A1A1A]/40 italic">{disabledReason}</p>
                          )}
                        </div>
                        <span className={`text-sm font-semibold ${isDisabled ? 'text-[#1A1A1A]/40' : 'text-[#1A1A1A]'}`}>
                          ${addon.price}
                        </span>
                        {isInCart ? (
                          isLockedAddOn ? (
                            <span className="text-xs font-medium px-2 py-1 rounded-md bg-[#B8956A]/10 text-[#B8956A] border border-[#B8956A]/30 flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Locked
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRemoveFromCart(addon.id)}
                              className="border-red-300 text-red-600 hover:bg-red-50"
                            >
                              Remove
                            </Button>
                          )
                        ) : isDisabled ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    size="sm"
                                    className="bg-[#B8956A] hover:bg-[#A68559] text-white"
                                    disabled={true}
                                  >
                                    Add
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{disabledReason}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleAddToCart(addon)}
                            className="bg-[#B8956A] hover:bg-[#A68559] text-white"
                          >
                            Add
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="bg-white rounded-lg shadow-lg border-2 border-[#B8956A]/20 p-6 space-y-4">
          <h3 className="font-semibold text-[#1A1A1A]">Payment</h3>
          <ul className="space-y-2 text-sm text-[#1A1A1A]/70">
            <li>• Standard invoicing upon delivery</li>
            {payAtClosingEnabled && (
              <li>
                • <strong>Pay-at-closing available upon request</strong> (settled as a small
                percentage of the final sale price)
              </li>
            )}
            <li>
              • <strong>Availability is limited and scheduled on a first-come basis.</strong>
            </li>
          </ul>
          <p className="text-xs text-[#1A1A1A]/50 italic pt-4 border-t border-[#1A1A1A]/10">
            Notes: MLS platforms compress media differently, all deliverables are exported for MLS
            compatibility. Custom quotes available for luxury, large acreage, or complex shoots.
          </p>
        </div>

        <div className="mt-6 p-2 text-center">
          <p className="text-[11px] text-[#1A1A1A]/50 italic leading-tight">
            <strong>*Introductory pricing is available for a limited time.</strong> Current pricing reflects early partner rates, locked in for 12 months from the first completed shoot. Standard rates may be adjusted in the future.
          </p>
        </div>

        {(selectedPackage || cartAddOns.length > 0) && (
          <div className="bg-white rounded-lg shadow-lg border-2 border-[#B8956A] p-6 mb-8">
            <h3 className="font-semibold text-[#1A1A1A] mb-4">Your Cart</h3>
            {selectedPackage && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-[#1A1A1A]">{selectedPackage.name}</span>
                {requestPayAtClosing ? (
                  <span className="font-semibold text-[#B8956A] italic">Pricing will be discussed</span>
                ) : isCustomQuote ? (
                  <span className="font-semibold text-[#B8956A] italic">Custom Quote</span>
                ) : (
                  <span className="font-semibold text-[#B8956A]">${tierPackagePrice}</span>
                )}
              </div>
            )}
            {cartAddOns.map((addon) => (
              <div key={addon.id} className="flex justify-between items-center mb-2">
                <span className="text-[#1A1A1A]/70 text-sm">+ {addon.name}</span>
                {requestPayAtClosing ? (
                  <span className="font-semibold text-[#1A1A1A] text-sm italic">Pricing will be discussed</span>
                ) : (
                  <span className="font-semibold text-[#1A1A1A] text-sm">${addon.price}</span>
                )}
              </div>
            ))}
            {studioAddOns.map((addon) => (
              <div key={addon.id} className="flex justify-between items-center mb-2">
                <span className="text-[#1A1A1A]/70 text-sm flex items-center gap-1">
                  <Film className="w-3 h-3 text-[#B8956A]" />
                  {addon.name}
                </span>
                {requestPayAtClosing ? (
                  <span className="font-semibold text-[#1A1A1A] text-sm italic">Pricing will be discussed</span>
                ) : (
                  <span className="font-semibold text-[#1A1A1A] text-sm">
                    {addon.isCustomQuote ? 'Custom Quote' : `$${addon.price}`}
                  </span>
                )}
              </div>
            ))}
            {studioBundle && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-[#1A1A1A]/70 text-sm flex items-center gap-1">
                  <Film className="w-3 h-3" style={{ color: '#FF5A4F' }} />
                  {studioBundle.name.split("—")[1]?.trim() || studioBundle.name} (monthly)
                </span>
                {requestPayAtClosing ? (
                  <span className="font-semibold text-[#1A1A1A] text-sm italic">Pricing will be discussed</span>
                ) : (
                  <span className="font-semibold text-[#1A1A1A] text-sm">${studioBundle.price}/mo</span>
                )}
              </div>
            )}
            {!requestPayAtClosing && (
              <div className="border-t border-[#1A1A1A]/10 mt-4 pt-4 flex justify-between items-center">
                <span className="font-semibold text-[#1A1A1A]">Total</span>
                <span className="text-2xl font-bold text-[#B8956A]">${totalPrice}</span>
              </div>
            )}
          </div>
        )}

        {payAtClosingEnabled && (selectedPackage || cartAddOns.length > 0) && (
          <div className="flex items-center justify-center gap-2 mt-8 mb-4">
            <input
              type="checkbox"
              id="payAtClosing"
              checked={requestPayAtClosing}
              onChange={(e) => setRequestPayAtClosing(e.target.checked)}
              className="w-4 h-4 accent-[#B8956A]"
            />
            <label htmlFor="payAtClosing" className="text-sm text-[#1A1A1A]/70 cursor-pointer">
              Request Pay-at-closing
            </label>
          </div>
        )}

        <div className="text-center mt-4">
          <Button
            onClick={() => {
              if (payAtClosingEnabled && requestPayAtClosing) {
                setShowPayAtClosingDialog(true);
              } else {
                setShowBookingForm(true);
              }
            }}
            size="lg"
            className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white px-12 py-6 text-lg"
            disabled={!selectedPackage && cartAddOns.length === 0}
          >
            {selectedPackage || cartAddOns.length > 0 ? "Take me to my cart" : "Select items to continue"}
          </Button>
        </div>
      </div>
    </div>
    </>
  );
}