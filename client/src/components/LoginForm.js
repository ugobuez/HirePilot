import React, { useState } from "react";
import { authService } from "../services/api";

const LoginForm = ({ onLogin, onSwitchToSignup }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setResetMsg("");
    setLoading(true);

    try {
      let result;
      if (isLogin) {
        result = await authService.login(email, password);
      } else {
        result = await authService.signup({
          email,
          password,
          fullName,
        });
      }

      localStorage.setItem("token", result.token);
      localStorage.setItem("user", JSON.stringify(result.user));
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Enter your email above first, then click Forgot password.");
      return;
    }
    setError("");
    setResetMsg("");
    setResetLoading(true);
    try {
      const result = await authService.forgotPassword(email);
      setResetMsg(result.message || "Password reset instructions sent.");
    } catch (err) {
      setError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-5">
          <div className="card shadow-lg border-0 rounded-4">
            <div className="card-body p-5">
              <div className="text-center mb-4">
                <h2 className="fw-bold">
                  <span className="text-primary">Hire</span>Pilot
                </h2>
                <p className="text-muted">
                  {isLogin ? "Welcome back!" : "Create your account"}
                </p>
              </div>

              {error && (
                <div className="alert alert-danger py-2 small">{error}</div>
              )}

              <form onSubmit={handleSubmit}>
                {!isLogin && (
                  <div className="mb-3">
                    <label className="form-label fw-semibold small">
                      Full Name
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-lg"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={!isLogin}
                    />
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label fw-semibold small">Email</label>
                  <input
                    type="email"
                    className="form-control form-control-lg"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="mb-4">
                  <label className="form-label fw-semibold small">
                    Password
                  </label>
                  <input
                    type="password"
                    className="form-control form-control-lg"
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg w-100 fw-bold rounded-pill"
                  disabled={loading}
                >
                  {loading
                    ? "Processing..."
                    : isLogin
                    ? "Sign In"
                    : "Create Account"}
                </button>

                {isLogin && (
                  <div className="text-center mt-3">
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none small text-muted"
                      onClick={handleForgotPassword}
                      disabled={resetLoading}
                    >
                      {resetLoading ? "Sending..." : "Forgot password?"}
                    </button>
                    {resetMsg && (
                      <div className="alert alert-success py-2 small mt-2 mb-0">
                        {resetMsg}
                      </div>
                    )}
                  </div>
                )}
              </form>

              <div className="text-center mt-4">
                <button
                  className="btn btn-link text-decoration-none"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError("");
                  }}
                >
                  {isLogin
                    ? "Don't have an account? Sign up"
                    : "Already have an account? Sign in"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;