"""
Train and export sample pre-trained machine learning models and synthetic datasets.
Produces:
1. ml/sample_data/customer_churn.csv (Classification dataset)
2. ml/sample_data/housing_prices.csv (Regression dataset)
3. ml/sample_data/evaluation_test.csv (Validation dataset)
4. ml/models/customer_churn_rf.joblib
5. ml/models/housing_price_gbr.joblib
6. ml/models/credit_risk_lr.joblib
"""

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, mean_absolute_error

os.makedirs('ml/sample_data', exist_ok=True)
os.makedirs('ml/models', exist_ok=True)

np.random.seed(42)
N_RECORDS = 2000

print("[1/4] Generating Customer Churn dataset & training RandomForestClassifier...")
tenure = np.random.randint(1, 72, size=N_RECORDS)
monthly_charges = np.random.uniform(20.0, 120.0, size=N_RECORDS)
total_charges = tenure * monthly_charges + np.random.normal(0, 50, size=N_RECORDS)
total_charges = np.maximum(total_charges, monthly_charges)
contract_type = np.random.choice([0, 1, 2], size=N_RECORDS)  # 0: Month-to-month, 1: One year, 2: Two year
payment_method = np.random.choice([0, 1, 2, 3], size=N_RECORDS)

# Churn probability based on realistic factors
prob = 0.4 - 0.005 * tenure + 0.003 * monthly_charges - 0.15 * contract_type
prob = 1 / (1 + np.exp(-prob))
churn = (np.random.uniform(0, 1, size=N_RECORDS) < prob).astype(int)

df_churn = pd.DataFrame({
    'id': range(1, N_RECORDS + 1),
    'tenure': tenure,
    'monthly_charges': np.round(monthly_charges, 2),
    'total_charges': np.round(total_charges, 2),
    'contract_type': contract_type,
    'payment_method': payment_method,
    'churn': churn
})
df_churn.to_csv('ml/sample_data/customer_churn.csv', index=False)
print(" -> Saved ml/sample_data/customer_churn.csv ({} rows)".format(len(df_churn)))

X_churn = df_churn[['tenure', 'monthly_charges', 'total_charges', 'contract_type', 'payment_method']]
y_churn = df_churn['churn']
X_train, X_test, y_train, y_test = train_test_split(X_churn, y_churn, test_size=0.2, random_state=42)

rf = RandomForestClassifier(n_estimators=50, max_depth=8, random_state=42)
rf.fit(X_train, y_train)
acc = accuracy_score(y_test, rf.predict(X_test))
print(" -> RandomForest Accuracy: {:.2f}%".format(acc * 100))
joblib.dump(rf, 'ml/models/customer_churn_rf.joblib')
print(" -> Dumped ml/models/customer_churn_rf.joblib")


print("\n[2/4] Generating Housing Prices dataset & training GradientBoostingRegressor...")
sqft = np.random.randint(600, 4500, size=N_RECORDS)
bedrooms = np.random.randint(1, 6, size=N_RECORDS)
bathrooms = np.random.randint(1, 5, size=N_RECORDS)
year_built = np.random.randint(1950, 2024, size=N_RECORDS)
zip_density = np.random.uniform(10.0, 100.0, size=N_RECORDS)

price = (
    50000 + 
    sqft * 180 + 
    bedrooms * 15000 + 
    bathrooms * 12000 + 
    (year_built - 1950) * 800 + 
    zip_density * 350 + 
    np.random.normal(0, 20000, size=N_RECORDS)
)

df_housing = pd.DataFrame({
    'id': range(1, N_RECORDS + 1),
    'square_feet': sqft,
    'bedrooms': bedrooms,
    'bathrooms': bathrooms,
    'year_built': year_built,
    'zipcode_density': np.round(zip_density, 1),
    'price': np.round(price, 2)
})
df_housing.to_csv('ml/sample_data/housing_prices.csv', index=False)
print(" -> Saved ml/sample_data/housing_prices.csv ({} rows)".format(len(df_housing)))

X_house = df_housing[['square_feet', 'bedrooms', 'bathrooms', 'year_built', 'zipcode_density']]
y_house = df_housing['price']
X_h_train, X_h_test, y_h_train, y_h_test = train_test_split(X_house, y_house, test_size=0.2, random_state=42)

gbr = GradientBoostingRegressor(n_estimators=60, max_depth=5, random_state=42)
gbr.fit(X_h_train, y_h_train)
mae = mean_absolute_error(y_h_test, gbr.predict(X_h_test))
print(" -> GradientBoosting MAE: ${:,.2f}".format(mae))
joblib.dump(gbr, 'ml/models/housing_price_gbr.joblib')
print(" -> Dumped ml/models/housing_price_gbr.joblib")


print("\n[3/4] Generating Credit Risk dataset & training LogisticRegression...")
age = np.random.randint(21, 70, size=N_RECORDS)
income = np.random.uniform(25000, 150000, size=N_RECORDS)
credit_score = np.random.randint(350, 850, size=N_RECORDS)
debt_to_income = np.random.uniform(0.05, 0.65, size=N_RECORDS)
loan_amount = np.random.uniform(5000, 80000, size=N_RECORDS)

default_logits = 2.0 - 0.005 * credit_score + 2.5 * debt_to_income - 0.00001 * income
default_prob = 1 / (1 + np.exp(-default_logits))
defaulted = (np.random.uniform(0, 1, size=N_RECORDS) < default_prob).astype(int)

df_credit = pd.DataFrame({
    'id': range(1, N_RECORDS + 1),
    'age': age,
    'annual_income': np.round(income, 2),
    'credit_score': credit_score,
    'debt_to_income': np.round(debt_to_income, 3),
    'loan_amount': np.round(loan_amount, 2),
    'defaulted': defaulted
})
df_credit.to_csv('ml/sample_data/credit_risk.csv', index=False)
print(" -> Saved ml/sample_data/credit_risk.csv ({} rows)".format(len(df_credit)))

X_cred = df_credit[['age', 'annual_income', 'credit_score', 'debt_to_income', 'loan_amount']]
y_cred = df_credit['defaulted']
lr = LogisticRegression(max_iter=1000)
lr.fit(X_cred, y_cred)
joblib.dump(lr, 'ml/models/credit_risk_lr.joblib')
print(" -> Dumped ml/models/credit_risk_lr.joblib")

print("\n[4/4] Creating evaluation test holdout...")
df_eval = df_churn.sample(n=300, random_state=99).copy()
df_eval.to_csv('ml/sample_data/evaluation_test.csv', index=False)
print(" -> Saved ml/sample_data/evaluation_test.csv (300 rows)")
print("\n[OK] Sample ML training completed successfully.")
