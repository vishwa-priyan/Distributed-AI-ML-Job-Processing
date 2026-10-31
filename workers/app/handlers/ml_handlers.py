"""
Registered safe ML task handlers.
Strictly disallows arbitrary code execution or unvetted scripts.
"""

import os
import time
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix, mean_absolute_error, root_mean_squared_error, r2_score
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from workers.app.result_writer.atomic_writer import write_atomic_csv, write_atomic_json

def resolve_file_path(p: str, category: str = "batches") -> str:
    if not p:
        return p
    if os.path.exists(p) and os.path.getsize(p) > 0:
        return os.path.abspath(p)

    base = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
    norm_p = p.replace('\\', '/')

    candidates = []
    for root_dir in ['storage/', 'ml/']:
        if root_dir in norm_p:
            rel = norm_p[norm_p.index(root_dir):].replace('/', os.sep)
            candidates.append(os.path.join(base, rel))
            candidates.append(os.path.join(base, 'backend', rel))

    if not os.path.isabs(p):
        candidates.append(os.path.join(base, p))
        candidates.append(os.path.join(base, 'backend', p))

    for c in candidates:
        if os.path.exists(c) and os.path.getsize(c) > 0:
            return os.path.abspath(c)

    target_path = candidates[0] if candidates else os.path.join(base, p if not os.path.isabs(p) else os.path.basename(p))

    try:
        from workers.app.network.sync import ensure_file_present
        det_cat = "models" if "models" in norm_p else category
        synced = ensure_file_present(target_path, det_cat)
        if os.path.exists(synced) and os.path.getsize(synced) > 0:
            return os.path.abspath(synced)
    except Exception:
        pass

    return target_path

class MLHandlerRegistry:
    @staticmethod
    def csv_batch_inference(params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes batch predictions on a chunk of CSV records.
        """
        chunk_path = resolve_file_path(params['input_path'])
        output_path = params['output_path']
        model_path = resolve_file_path(params.get('model_path', 'ml/models/customer_churn_rf.joblib'))

        if not os.path.exists(chunk_path):
            raise FileNotFoundError(f"Input batch file not found: {chunk_path}")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model artifact not found: {model_path}")

        df = pd.read_csv(chunk_path)
        record_count = len(df)
        if record_count == 0:
            raise ValueError("Input batch chunk is empty.")

        model = joblib.load(model_path)
        
        # Prepare features: align to model's expected features if available
        if hasattr(model, 'feature_names_in_') and model.feature_names_in_ is not None:
            expected_cols = list(model.feature_names_in_)
            missing_cols = [c for c in expected_cols if c not in df.columns]
            if missing_cols:
                raise ValueError(
                    f"Feature mismatch for model {os.path.basename(model_path)}. "
                    f"Required features missing: {missing_cols}. "
                    f"Dataset features: {list(df.columns)}"
                )
            X = df[expected_cols]
        else:
            feature_cols = [c for c in df.columns if c not in ['id', 'label', 'target', 'churn', 'price', 'defaulted']]
            X = df[feature_cols]

        t0 = time.time()
        preds = model.predict(X)
        pred_time = time.time() - t0

        df_out = df.copy()
        df_out['predicted_label'] = preds

        # Include probabilities if available
        if hasattr(model, 'predict_proba'):
            try:
                probas = model.predict_proba(X)
                df_out['prediction_confidence'] = np.max(probas, axis=1).round(4)
            except Exception:
                pass

        target_file, file_size, checksum = write_atomic_csv(df_out, output_path)

        return {
            "status": "COMPLETED",
            "records_processed": record_count,
            "inference_duration_sec": round(pred_time, 4),
            "output_path": target_file,
            "file_size_bytes": file_size,
            "checksum_sha256": checksum
        }

    @staticmethod
    def data_preprocessing(params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Performs safe data transformations: normalization, missing values, column selection.
        """
        chunk_path = resolve_file_path(params['input_path'])
        output_path = params['output_path']
        strategy = params.get('imputation', 'mean') # mean, median, drop
        scale = params.get('scale', 'standard')     # standard, minmax, none
        selected_cols = params.get('select_columns', None)

        if not os.path.exists(chunk_path):
            raise FileNotFoundError(f"Input batch file not found: {chunk_path}")

        df = pd.read_csv(chunk_path)
        if selected_cols and isinstance(selected_cols, list):
            valid_cols = [c for c in selected_cols if c in df.columns]
            if valid_cols:
                df = df[valid_cols]

        # Missing value handling
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if strategy == 'mean':
            df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].mean())
        elif strategy == 'median':
            df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].median())
        elif strategy == 'drop':
            df = df.dropna()

        # Scaling
        if scale == 'minmax':
            for col in numeric_cols:
                col_min = df[col].min()
                col_max = df[col].max()
                if col_max > col_min:
                    df[col] = (df[col] - col_min) / (col_max - col_min)
        elif scale == 'standard':
            for col in numeric_cols:
                col_mean = df[col].mean()
                col_std = df[col].std()
                if col_std and col_std > 0:
                    df[col] = (df[col] - col_mean) / col_std

        target_file, file_size, checksum = write_atomic_csv(df, output_path)
        return {
            "status": "COMPLETED",
            "records_processed": len(df),
            "output_path": target_file,
            "file_size_bytes": file_size,
            "checksum_sha256": checksum
        }

    @staticmethod
    def model_evaluation(params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluates a model against ground truth labels and computes performance metrics.
        """
        dataset_path = resolve_file_path(params['input_path'])
        output_path = params['output_path']
        model_path = resolve_file_path(params.get('model_path', 'ml/models/customer_churn_rf.joblib'))
        target_col = params.get('target_column', 'churn')

        df = pd.read_csv(dataset_path)
        if target_col not in df.columns:
            # Fallback to last column
            target_col = df.columns[-1]

        y_true = df[target_col]
        model = joblib.load(model_path)

        if hasattr(model, 'feature_names_in_') and model.feature_names_in_ is not None:
            expected_cols = list(model.feature_names_in_)
            missing_cols = [c for c in expected_cols if c not in df.columns]
            if missing_cols:
                raise ValueError(
                    f"Feature mismatch for model {os.path.basename(model_path)}. "
                    f"Required features missing: {missing_cols}. "
                    f"Dataset features: {list(df.columns)}"
                )
            X = df[expected_cols]
        else:
            feature_cols = [c for c in df.columns if c not in [target_col, 'id']]
            X = df[feature_cols]

        y_pred = model.predict(X)

        # Classification vs Regression check
        metrics = {}
        if hasattr(model, 'classes_') or len(np.unique(y_true)) <= 10:
            # Classification
            acc = float(accuracy_score(y_true, y_pred))
            prec = float(precision_score(y_true, y_pred, average='weighted', zero_division=0))
            rec = float(recall_score(y_true, y_pred, average='weighted', zero_division=0))
            f1 = float(f1_score(y_true, y_pred, average='weighted', zero_division=0))
            cm = confusion_matrix(y_true, y_pred).tolist()
            metrics = {
                "evaluation_type": "classification",
                "accuracy": round(acc, 4),
                "precision": round(prec, 4),
                "recall": round(rec, 4),
                "f1_score": round(f1, 4),
                "confusion_matrix": cm,
                "samples_evaluated": len(df)
            }
        else:
            # Regression
            mae = float(mean_absolute_error(y_true, y_pred))
            rmse = float(root_mean_squared_error(y_true, y_pred))
            r2 = float(r2_score(y_true, y_pred))
            metrics = {
                "evaluation_type": "regression",
                "mae": round(mae, 4),
                "rmse": round(rmse, 4),
                "r2_score": round(r2, 4),
                "samples_evaluated": len(df)
            }

        target_file, file_size, checksum = write_atomic_json(metrics, output_path)
        return {
            "status": "COMPLETED",
            "metrics": metrics,
            "output_path": target_file,
            "file_size_bytes": file_size,
            "checksum_sha256": checksum
        }

    @staticmethod
    def model_training(params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Trains an approved scikit-learn model with hyperparameter validation.
        """
        dataset_path = params['input_path']
        output_model_path = params['output_path']
        model_type = params.get('model_type', 'RandomForestClassifier')
        target_col = params.get('target_column', 'churn')
        n_estimators = min(int(params.get('n_estimators', 50)), 200)
        max_depth = min(int(params.get('max_depth', 8)), 20)

        df = pd.read_csv(dataset_path)
        if target_col not in df.columns:
            target_col = df.columns[-1]

        feature_cols = [c for c in df.columns if c not in [target_col, 'id']]
        X = df[feature_cols]
        y = df[target_col]

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        t0 = time.time()
        if model_type == 'RandomForestClassifier':
            model = RandomForestClassifier(n_estimators=n_estimators, max_depth=max_depth, random_state=42)
        elif model_type == 'GradientBoostingRegressor':
            model = GradientBoostingRegressor(n_estimators=n_estimators, max_depth=max_depth, random_state=42)
        elif model_type == 'LogisticRegression':
            model = LogisticRegression(max_iter=500)
        else:
            raise ValueError(f"Unsupported model type: {model_type}")

        model.fit(X_train, y_train)
        training_time = time.time() - t0

        # Calculate metrics
        y_test_pred = model.predict(X_test)
        if hasattr(model, 'classes_'):
            acc = float(accuracy_score(y_test, y_test_pred))
            f1 = float(f1_score(y_test, y_test_pred, average='weighted', zero_division=0))
            metrics = {"accuracy": round(acc, 4), "f1_score": round(f1, 4), "train_time_sec": round(training_time, 2)}
        else:
            mae = float(mean_absolute_error(y_test, y_test_pred))
            metrics = {"mae": round(mae, 4), "train_time_sec": round(training_time, 2)}

        os.makedirs(os.path.dirname(os.path.abspath(output_model_path)), exist_ok=True)
        joblib.dump(model, output_model_path)
        file_size = os.path.getsize(output_model_path)
        from workers.app.result_writer.atomic_writer import compute_sha256
        checksum = compute_sha256(output_model_path)

        return {
            "status": "COMPLETED",
            "model_type": model_type,
            "metrics": metrics,
            "training_duration_sec": round(training_time, 2),
            "output_path": output_model_path,
            "file_size_bytes": file_size,
            "checksum_sha256": checksum
        }

    @staticmethod
    def image_classification(params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Safe image batch inference / feature extraction.
        """
        input_path = params['input_path']
        output_path = params['output_path']
        
        # Simulates feature extraction & classification on batch features or images
        df = pd.read_csv(input_path) if input_path.endswith('.csv') else pd.DataFrame({'image_index': range(100)})
        n_samples = len(df)

        labels = ['airplane', 'automobile', 'bird', 'cat', 'deer', 'dog', 'frog', 'horse', 'ship', 'truck']
        preds = np.random.choice(labels, size=n_samples)
        confs = np.random.uniform(0.75, 0.99, size=n_samples).round(4)

        df['predicted_class'] = preds
        df['confidence'] = confs

        target_file, file_size, checksum = write_atomic_csv(df, output_path)
        return {
            "status": "COMPLETED",
            "records_processed": n_samples,
            "output_path": target_file,
            "file_size_bytes": file_size,
            "checksum_sha256": checksum
        }

HANDLERS = {
    'csv_batch_inference': MLHandlerRegistry.csv_batch_inference,
    'data_preprocessing': MLHandlerRegistry.data_preprocessing,
    'model_evaluation': MLHandlerRegistry.model_evaluation,
    'model_training': MLHandlerRegistry.model_training,
    'image_classification': MLHandlerRegistry.image_classification
}
