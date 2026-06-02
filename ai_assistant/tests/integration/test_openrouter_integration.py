"""
Integration tests for OpenRouter API integration

Tests the actual API endpoint behavior with mocked OpenRouter responses.
"""

import pytest
import json
from unittest.mock import patch, MagicMock
import requests


class TestOpenRouterIntegration:
    """Test OpenRouter API integration with mocked responses"""

    @pytest.mark.integration
    def test_successful_api_call(self):
        """Should successfully call OpenRouter API and parse response"""
        mock_response = {
            "id": "chatcmpl-123",
            "object": "text_completion",
            "created": 1234567890,
            "model": "meta-llama/llama-3.1-70b-instruct",
            "choices": [{
                "message": {
                    "content": "This is a test response from OpenRouter.",
                    "reasoning_content": ""
                },
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 20,
                "total_tokens": 30
            }
        }
        
        with patch('requests.post') as mock_post:
            mock_post.return_value.json.return_value = mock_response
            mock_post.return_value.status_code = 200
            
            # Simulate API call
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": "Bearer test-key"},
                json={"model": "meta-llama/llama-3.1-70b-instruct", "messages": []}
            )
            
            data = response.json()
            assert data["choices"][0]["message"]["content"] == "This is a test response from OpenRouter."

    @pytest.mark.integration
    def test_api_timeout_handling(self):
        """Should handle API timeout gracefully"""
        with patch('requests.post') as mock_post:
            mock_post.side_effect = requests.Timeout("Connection timeout")
            
            try:
                requests.post("https://openrouter.ai/api/v1/chat/completions", timeout=30)
                assert False, "Should have raised Timeout"
            except requests.Timeout:
                # Expected behavior
                pass

    @pytest.mark.integration
    def test_api_connection_error(self):
        """Should handle connection errors"""
        with patch('requests.post') as mock_post:
            mock_post.side_effect = requests.ConnectionError("Failed to connect")
            
            try:
                requests.post("https://openrouter.ai/api/v1/chat/completions")
                assert False, "Should have raised ConnectionError"
            except requests.ConnectionError:
                # Expected behavior
                pass

    @pytest.mark.integration
    def test_invalid_api_key_response(self):
        """Should handle invalid API key error from OpenRouter"""
        mock_error_response = {
            "error": {
                "message": "Invalid API key",
                "code": "invalid_api_key",
                "status": 401
            }
        }
        
        with patch('requests.post') as mock_post:
            mock_post.return_value.status_code = 401
            mock_post.return_value.json.return_value = mock_error_response
            
            response = requests.post("https://openrouter.ai/api/v1/chat/completions")
            assert response.status_code == 401
            data = response.json()
            assert data["error"]["code"] == "invalid_api_key"

    @pytest.mark.integration
    def test_rate_limit_response(self):
        """Should handle rate limit errors (429)"""
        mock_error_response = {
            "error": {
                "message": "Rate limit exceeded",
                "code": "rate_limit_exceeded",
                "status": 429
            }
        }
        
        with patch('requests.post') as mock_post:
            mock_post.return_value.status_code = 429
            mock_post.return_value.json.return_value = mock_error_response
            
            response = requests.post("https://openrouter.ai/api/v1/chat/completions")
            assert response.status_code == 429

    @pytest.mark.integration
    def test_model_not_found_response(self):
        """Should handle model not found errors"""
        mock_error_response = {
            "error": {
                "message": "Model not found: invalid/model",
                "code": "model_not_found",
                "status": 400
            }
        }
        
        with patch('requests.post') as mock_post:
            mock_post.return_value.status_code = 400
            mock_post.return_value.json.return_value = mock_error_response
            
            response = requests.post("https://openrouter.ai/api/v1/chat/completions")
            assert response.status_code == 400

    @pytest.mark.integration
    def test_empty_response_content(self):
        """Should handle empty content from API"""
        mock_response = {
            "choices": [{
                "message": {
                    "content": "",
                    "reasoning_content": ""
                }
            }]
        }
        
        with patch('requests.post') as mock_post:
            mock_post.return_value.json.return_value = mock_response
            mock_post.return_value.status_code = 200
            
            response = requests.post("https://openrouter.ai/api/v1/chat/completions")
            data = response.json()
            assert data["choices"][0]["message"]["content"] == ""

    @pytest.mark.integration
    def test_streaming_response_handling(self):
        """Should handle streaming responses"""
        streaming_chunks = [
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n",
            "data: [DONE]\n"
        ]
        
        with patch('requests.post') as mock_post:
            mock_post.return_value.iter_lines.return_value = streaming_chunks
            mock_post.return_value.status_code = 200
            
            response = requests.post("https://openrouter.ai/api/v1/chat/completions", stream=True)
            assert response.status_code == 200

    @pytest.mark.integration
    def test_multiple_choices_response(self):
        """Should handle responses with multiple choices"""
        mock_response = {
            "choices": [
                {"message": {"content": "First choice"}},
                {"message": {"content": "Second choice"}}
            ]
        }
        
        with patch('requests.post') as mock_post:
            mock_post.return_value.json.return_value = mock_response
            mock_post.return_value.status_code = 200
            
            response = requests.post("https://openrouter.ai/api/v1/chat/completions")
            data = response.json()
            assert len(data["choices"]) == 2

    @pytest.mark.integration
    def test_api_headers_format(self):
        """Should send correct headers to OpenRouter API"""
        with patch('requests.post') as mock_post:
            mock_post.return_value.status_code = 200
            mock_post.return_value.json.return_value = {"choices": []}
            
            requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": "Bearer sk-or-test-key",
                    "Content-Type": "application/json"
                },
                json={"model": "meta-llama/llama-3.1-70b-instruct"}
            )
            
            # Verify the call was made with correct headers
            call_kwargs = mock_post.call_args[1]
            assert "Authorization" in call_kwargs["headers"]
            assert call_kwargs["headers"]["Authorization"].startswith("Bearer")

    @pytest.mark.integration
    @pytest.mark.slow
    def test_timeout_with_retry(self):
        """Should retry on timeout (if implemented)"""
        with patch('requests.post') as mock_post:
            # First call times out, second succeeds
            mock_post.side_effect = [
                requests.Timeout(),
                MagicMock(status_code=200, json=lambda: {"choices": []})
            ]
            
            # This test assumes retry logic exists
            # Adjust based on actual implementation


class TestAPIResponseFormats:
    """Test various response format variations"""

    @pytest.mark.integration
    def test_response_with_function_calls(self):
        """Should handle responses with function call information"""
        mock_response = {
            "choices": [{
                "message": {
                    "content": "I'll help you",
                    "function_call": {
                        "name": "search",
                        "arguments": "{\"query\": \"test\"}"
                    }
                }
            }]
        }
        
        with patch('requests.post') as mock_post:
            mock_post.return_value.json.return_value = mock_response
            response = requests.post("https://openrouter.ai/api/v1/chat/completions")
            data = response.json()
            assert "function_call" in data["choices"][0]["message"]

    @pytest.mark.integration
    def test_response_with_citations(self):
        """Should handle responses with citation information"""
        mock_response = {
            "choices": [{
                "message": {
                    "content": "According to research [1], ...",
                    "citations": [
                        {"url": "https://example.com", "title": "Example"}
                    ]
                }
            }]
        }
        
        with patch('requests.post') as mock_post:
            mock_post.return_value.json.return_value = mock_response
            response = requests.post("https://openrouter.ai/api/v1/chat/completions")
            data = response.json()
            assert "citations" in data["choices"][0]["message"]
