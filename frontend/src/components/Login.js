import React, { useState, useEffect } from 'react';
import { User, Building2, Users, Mail, Lock, Phone, MapPin, FileText, Eye, EyeOff, ArrowLeft, Truck, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import API from '../api';

// User Type Selection Component
const UserTypeSelection = ({ onSelectType }) => {
  const userTypes = [
    { id: 'retailers', label: 'Retailer', icon: Store, description: 'Shop owners and retail businesses' },
    { id: 'distributors', label: 'Distributor', icon: Building2, description: 'Wholesale and distribution businesses' },
    { id: 'partners', label: 'Delivery Partner', icon: Truck, description: 'Logistics and delivery services' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-3 tracking-tight">Welcome to Sledge</h1>
          <p className="text-slate-500 text-lg">Select your account type to continue</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {userTypes.map((type) => {
            const IconComponent = type.icon;
            return (
              <button
                key={type.id}
                onClick={() => onSelectType(type.id)}
                className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-slate-200 hover:border-indigo-500 group"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6 group-hover:bg-indigo-100 transition-colors">
                    <IconComponent className="w-10 h-10 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{type.label}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{type.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Login Component
const LoginPage = ({ userType, onBack, onNavigateToRegister, onNavigateToForgot }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const endpoint = userType === 'retailers' ? '/retailers/login' : '/distributors/login';
      const response = await API.post(endpoint, {
        email: loginData.email,
        password: loginData.password
      });

      setMessage({ type: 'success', text: 'Login successful!' });
      console.log('Login response:', response.data);

      if (authLogin) {
        authLogin({ user: response.data });
      }

      setTimeout(() => {
        navigate(userType === 'retailers' ? '/retailer' : '/distributor');
      }, 1000);
    } catch (error) {
      // The API sends { error } for 4xx and { error: "Internal server error" }
      // for 5xx; older handlers used { message }. A request that never got a
      // response (CORS, timeout, cold-started backend) has no error.response -
      // that is a connection problem, not a wrong password.
      const data = error.response?.data;
      let errorMessage;
      if (!error.response) {
        errorMessage = 'Cannot reach the server. Check your connection and try again.';
      } else if (error.response.status >= 500) {
        errorMessage = 'Server error. Please try again in a moment.';
      } else {
        errorMessage =
          data?.error || data?.message || 'Invalid credentials. Please try again.';
      }
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    console.log('Google Sign In for', userType);
    setMessage({ type: 'info', text: 'Google Sign-In coming soon!' });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
        <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-900 mb-8 transition-colors font-medium text-sm">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to selection
        </button>

        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h2>
          <p className="text-slate-500">Sign in to your {userType === 'retailers' ? 'Retailer' : 'Distributor'} account</p>
        </div>

        {message.text && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-medium flex items-center ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
              message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' :
                'bg-indigo-50 text-indigo-700 border border-indigo-100'
            }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
              <input
                type="email"
                value={loginData.email}
                onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                placeholder="Enter your email"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                className="w-full pl-10 pr-12 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
              <span className="ml-2 text-sm text-slate-600">Remember me</span>
            </label>
            <button
              type="button"
              onClick={onNavigateToForgot}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </span>
            ) : 'Sign In'}
          </button>
        </form>

        <div className="mt-8">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-slate-500 font-medium">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="mt-6 w-full flex items-center justify-center px-4 py-3 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors font-medium text-slate-700 bg-white"
          >
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
        </div>

        <p className="mt-8 text-center text-sm text-slate-600">
          Don't have an account?{' '}
          <button onClick={onNavigateToRegister} className="text-indigo-600 hover:text-indigo-700 font-bold transition-colors">
            Create account
          </button>
        </p>
      </div>
    </div>
  );
};

// Registration Component
const RegisterPage = ({ userType, onBack, onNavigateToLogin }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [location, setLocation] = useState('');
  const [registerData, setRegisterData] = useState({
    businessName: '',
    companyName: '',
    ownerName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    gstNumber: '',
    businessType: '',
    pincode: '',
    location: ''
  });

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = `${position.coords.latitude},${position.coords.longitude}`;
          setLocation(coords);
        },
        (error) => console.error('Location error:', error)
      );
    }
  }, []);

  const businessTypes = [
    'Retail Store', 'Wholesale', 'E-commerce', 'Manufacturing',
    'Distribution', 'Service Provider', 'Other'
  ];

  const handleRegister = async (e) => {
    e.preventDefault();

    if (registerData.password !== registerData.confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const endpoint = userType === 'retailers' ? '/retailers/register' : '/distributors/register';
      const payload = {
        ...(userType === 'retailers'
          ? { businessName: registerData.businessName }
          : { companyName: registerData.companyName }
        ),
        ownerName: registerData.ownerName,
        email: registerData.email,
        password: registerData.password,
        phone: registerData.phone,
        gstNumber: registerData.gstNumber,
        businessType: registerData.businessType,
        pincode: registerData.pincode,
        location: location || registerData.location
      };

      await API.post(endpoint, payload);
      setMessage({ type: 'success', text: 'Account created successfully!' });

      setRegisterData({
        businessName: '',
        companyName: '',
        ownerName: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
        gstNumber: '',
        businessType: '',
        pincode: '',
        location: ''
      });

      setTimeout(() => {
        onNavigateToLogin();
      }, 1500);
    } catch (error) {
      const data = error.response?.data;
      let errorMessage;
      if (!error.response) {
        errorMessage = 'Cannot reach the server. Check your connection and try again.';
      } else if (error.response.status >= 500) {
        errorMessage = 'Server error. Please try again in a moment.';
      } else {
        errorMessage =
          data?.error || data?.message || 'Registration failed. Please try again.';
      }
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
        <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-900 mb-8 transition-colors font-medium text-sm">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>

        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Create Account</h2>
          <p className="text-slate-500">Register as a {userType === 'retailers' ? 'Retailer' : 'Distributor'}</p>
        </div>

        {message.text && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-medium flex items-center ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
              'bg-red-50 text-red-700 border border-red-100'
            }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {userType === 'retailers' ? 'Business Name' : 'Company Name'}
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={userType === 'retailers' ? registerData.businessName : registerData.companyName}
                  onChange={(e) => setRegisterData({
                    ...registerData,
                    [userType === 'retailers' ? 'businessName' : 'companyName']: e.target.value
                  })}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Enter name"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Owner Name</label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={registerData.ownerName}
                  onChange={(e) => setRegisterData({ ...registerData, ownerName: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Enter owner name"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={registerData.email}
                  onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Enter email"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type="tel"
                  value={registerData.phone}
                  onChange={(e) => setRegisterData({ ...registerData, phone: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Enter phone"
                  required
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
                  type={showPassword ? 'text' : 'password'}
                  value={registerData.password}
                  onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                  className="w-full pl-10 pr-12 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Enter password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={registerData.confirmPassword}
                  onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Confirm new password"
                  required
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
                  value={registerData.gstNumber}
                  onChange={(e) => setRegisterData({ ...registerData, gstNumber: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Enter GST number"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Business Type</label>
              <select
                value={registerData.businessType}
                onChange={(e) => setRegisterData({ ...registerData, businessType: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none bg-white"
                required
              >
                <option value="">Select type</option>
                {businessTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Pincode</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={registerData.pincode}
                  onChange={(e) => setRegisterData({ ...registerData, pincode: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Enter pincode"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Location</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={registerData.location}
                  onChange={(e) => setRegisterData({ ...registerData, location: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Auto-detected"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed mt-4"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating account...
              </span>
            ) : 'Create Account'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <button onClick={onNavigateToLogin} className="text-indigo-600 hover:text-indigo-700 font-bold transition-colors">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};

// Forgot Password Component
const ForgotPasswordPage = ({ userType, onBack }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      await API.post(`/${userType}/forgot-password`, { email });
      setMessage({ type: 'success', text: 'OTP sent to your email!' });
      setTimeout(() => setStep(2), 1500);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to send OTP. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      await API.post(`/${userType}/verify-otp`, { email, otp });
      setMessage({ type: 'success', text: 'OTP verified!' });
      setTimeout(() => setStep(3), 1500);
    } catch (error) {
      setMessage({ type: 'error', text: 'Invalid OTP. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      await API.post(`/${userType}/reset-password`, { email, otp, newPassword });
      setMessage({ type: 'success', text: 'Password reset successful!' });
      setTimeout(() => onBack(), 1500);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to reset password. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
        <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-900 mb-8 transition-colors font-medium text-sm">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to login
        </button>

        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            {step === 1 ? 'Forgot Password' : step === 2 ? 'Verify OTP' : 'Reset Password'}
          </h2>
          <p className="text-slate-500">
            {step === 1 ? 'Enter your email to receive OTP' :
              step === 2 ? 'Enter the OTP sent to your email' :
                'Create a new password'}
          </p>
        </div>

        {message.text && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-medium flex items-center ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
              'bg-red-50 text-red-700 border border-red-100'
            }`}>
            {message.text}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleSendOTP} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>

            <button
              type="button"
              onClick={() => handleSendOTP({ preventDefault: () => { } })}
              className="w-full text-sm text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
            >
              Resend OTP
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyOTP} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Enter OTP</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center text-2xl tracking-widest font-mono transition-all outline-none"
                placeholder="000000"
                maxLength={6}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>

            <button
              type="button"
              onClick={() => handleSendOTP({ preventDefault: () => { } })}
              className="w-full text-sm text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
            >
              Resend OTP
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Enter new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Confirm new password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// Main App Component
export default function Login() {
  const [currentPage, setCurrentPage] = useState('userType');
  const [selectedUserType, setSelectedUserType] = useState(null);

  const handleUserTypeSelect = (type) => {
    setSelectedUserType(type);
    setCurrentPage('login');
  };

  return (
    <div>
      {currentPage === 'userType' && (
        <UserTypeSelection onSelectType={handleUserTypeSelect} />
      )}

      {currentPage === 'login' && (
        <LoginPage
          userType={selectedUserType}
          onBack={() => setCurrentPage('userType')}
          onNavigateToRegister={() => setCurrentPage('register')}
          onNavigateToForgot={() => setCurrentPage('forgot')}
        />
      )}

      {currentPage === 'register' && (
        <RegisterPage
          userType={selectedUserType}
          onBack={() => setCurrentPage('login')}
          onNavigateToLogin={() => setCurrentPage('login')}
        />
      )}

      {currentPage === 'forgot' && (
        <ForgotPasswordPage
          userType={selectedUserType}
          onBack={() => setCurrentPage('login')}
        />
      )}
    </div>
  );
}