import { useEffect, useState } from "react";
import API from "../api";
import { Building2, User, Phone, Mail, Lock, FileText, MapPin, ArrowRight, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState("");
  const [pincode, setPincode] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = `${position.coords.latitude},${position.coords.longitude}`;
          setLocation(coords);
        },
        (error) => {
          console.error("Error fetching location:", error);
          // Don't alert, just log
        }
      );
    }
  }, []);

  const handleSignUp = async () => {
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      alert("Invalid email format");
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      alert("Invalid phone number");
      return;
    }
    if (gstNumber && !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}[A-Z\d]{1}[A-Z\d]{1}$/.test(gstNumber)) {
      alert("Invalid GST number format");
      return;
    }
    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await API.post("/retailers/register", {
        businessName,
        ownerName,
        email,
        password,
        phone,
        gstNumber,
        businessType,
        pincode,
        location,
      });

      // alert("Registration successful!");
      localStorage.setItem("token", res.data.token);
      setStep(2);
    } catch (err) {
      alert(err.response?.data?.message || "Registration failed");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = () => {
    // Mock OTP verification for now
    console.log("Verifying OTP", otp);
    setStep(3);
    setTimeout(() => {
      navigate('/login');
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col md:flex-row">

        {/* Left Side - Visual */}
        <div className="hidden md:flex md:w-1/3 bg-indigo-600 p-8 flex-col justify-between text-white">
          <div>
            <h2 className="text-3xl font-bold mb-4">Join Sledge</h2>
            <p className="text-indigo-100">Connect with top distributors and streamline your retail business today.</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
                <CheckCircle className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium">Easy Inventory Management</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
                <CheckCircle className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium">Fast Order Processing</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
                <CheckCircle className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium">Real-time Tracking</span>
            </div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="flex-1 p-8 md:p-12">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">
              {step === 1 ? "Create Retailer Account" : step === 2 ? "Verify Email" : "Welcome Aboard!"}
            </h2>
            <p className="text-slate-500 mt-1">
              {step === 1 ? "Fill in your details to get started" : step === 2 ? "Enter the OTP sent to your email" : "Your account has been created successfully"}
            </p>
          </div>

          {step === 1 ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Business Name</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                      placeholder="Enter business name"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Owner Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                      placeholder="Enter owner name"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                      placeholder="10-digit number"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                      placeholder="Enter email"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                      placeholder="Create password"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                      placeholder="Confirm password"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">GST Number (Optional)</label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                      placeholder="Enter GST number"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Business Type</label>
                  <select
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none bg-white"
                  >
                    <option value="">Select type</option>
                    <option value="Retail Store">Retail Store</option>
                    <option value="Wholesale">Wholesale</option>
                    <option value="E-commerce">E-commerce</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Pincode</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    placeholder="Enter pincode"
                  />
                </div>
              </div>

              <button
                onClick={handleSignUp}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed mt-4 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    Create Account <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          ) : step === 2 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Check your email</h3>
              <p className="text-slate-500 mb-6">We've sent a verification code to {email}</p>

              <input
                type="text"
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full max-w-xs mx-auto px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center text-2xl tracking-widest font-mono mb-6"
                maxLength={6}
              />

              <button
                onClick={verifyOtp}
                className="w-full max-w-xs mx-auto bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-sm"
              >
                Verify OTP
              </button>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Registration Complete!</h3>
              <p className="text-slate-500 mb-8">Your account has been successfully created. Redirecting you to login...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
